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
import { Context, Effect, Layer } from "effect";
import { getOrCreateKv } from "./kv";
import { trustedOrigins } from "./origins";

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

export const createAuth = (secret: string) =>
  betterAuth({
    secret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    user: {
      changeEmail: {
        enabled: true,
        updateEmailWithoutVerification: true,
      },
    },
    plugins: [expo()],
    trustedOrigins: [...trustedOrigins],
  });

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
    return createAuth(secret);
  }),
);
