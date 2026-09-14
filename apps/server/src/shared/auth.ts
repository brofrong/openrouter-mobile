import { randomBytes } from "node:crypto";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { expo } from "@better-auth/expo";
import {
  account,
  createAuthDb,
  session,
  user,
  verification,
} from "@openrouter-mobile/db";
import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { Context, Effect, Layer } from "effect";
import {
  OIDC_PROVIDER_ID,
  type OidcSettings,
  oidcIncompleteMessage,
  resolveOidcFromConfig,
} from "./auth-options";
import { DEFAULT_BASE_URL } from "./baseUrl";
import { AppConfig } from "./config";
import { getOrCreateKv } from "./kv";
import { makeTrustedOrigins } from "./origins";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://openrouter:openrouter@localhost:5432/openrouter";

const db = createAuthDb(databaseUrl);

const authSchema = { user, session, account, verification };

export const BETTER_AUTH_SECRET_KEY = "better_auth_secret";

const CLI_PLACEHOLDER_SECRET = "cli-placeholder-secret-that-is-32-chars-min";

export const generateBetterAuthSecret = (): string =>
  randomBytes(32).toString("base64");

const initialBetterAuthSecret = (): string => {
  const fromEnv = process.env.BETTER_AUTH_SECRET;
  if (fromEnv !== undefined && fromEnv.length >= 32) {
    return fromEnv;
  }
  return generateBetterAuthSecret();
};

export type CreateAuthOptions = {
  oidc?: OidcSettings;
  disableSignup?: boolean;
};

export const createAuth = (
  secret: string,
  baseUrl: string = DEFAULT_BASE_URL,
  options: CreateAuthOptions = {},
) => {
  const oidcEnabled = options.oidc !== undefined;
  const disableSignup = options.disableSignup === true;
  return betterAuth({
    secret,
    baseURL: baseUrl,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: !oidcEnabled,
      disableSignUp: disableSignup,
    },
    user: {
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: true,
      },
    },
    plugins: [
      expo(),
      genericOAuth({
        config: options.oidc
          ? [
              {
                providerId: OIDC_PROVIDER_ID,
                clientId: options.oidc.clientId,
                clientSecret: options.oidc.clientSecret,
                discoveryUrl: options.oidc.discoveryUrl,
                scopes: [...options.oidc.scopes],
                disableSignUp: disableSignup,
              },
            ]
          : [],
      }),
    ],
    trustedOrigins: makeTrustedOrigins(baseUrl),
  });
};

export type AuthInstance = ReturnType<typeof createAuth>;
export type Session = AuthInstance["$Infer"]["Session"];

/**
 * Loaded by `bun x auth generate` without Postgres. Runtime HTTP/RPC must use
 * `AuthLive`, which persists a secret in `kv`.
 */
export const auth = createAuth(CLI_PLACEHOLDER_SECRET);

export class Auth extends Context.Service<Auth, AuthInstance>()(
  "@openrouter-mobile/server/Auth",
) {}

export const AuthLive = Layer.effect(
  Auth,
  Effect.gen(function* () {
    const secret = yield* getOrCreateKv(
      BETTER_AUTH_SECRET_KEY,
      initialBetterAuthSecret,
    );
    const config = yield* AppConfig;
    const oidc = resolveOidcFromConfig(config);
    if (oidc._tag === "incomplete") {
      return yield* Effect.die(new Error(oidcIncompleteMessage(oidc.missing)));
    }
    return createAuth(secret, config.baseUrl, {
      ...(oidc._tag === "on" ? { oidc: oidc.settings } : {}),
      disableSignup: config.authDisableSignup,
    });
  }),
);
