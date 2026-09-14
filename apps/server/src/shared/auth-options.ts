import { AuthSettings, OIDC_PROVIDER_ID } from "@openrouter-mobile/domain";
import { Option, Redacted } from "effect";

export { OIDC_PROVIDER_ID };

export type OidcSettings = {
  issuer: string;
  discoveryUrl: string;
  clientId: string;
  clientSecret: string;
  scopes: readonly string[];
};

export type ResolvedOidc =
  | { readonly _tag: "off" }
  | { readonly _tag: "on"; readonly settings: OidcSettings }
  | { readonly _tag: "incomplete"; readonly missing: readonly string[] };

export const DEFAULT_OIDC_SCOPES = "openid email profile";

export const presentEnv = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

export const parseOidcScopes = (
  value: string | undefined,
): readonly string[] => {
  const scopes = (value ?? DEFAULT_OIDC_SCOPES)
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
  return scopes.length > 0 ? scopes : DEFAULT_OIDC_SCOPES.split(" ");
};

export const toOidcDiscoveryUrl = (issuer: string): string => {
  const trimmed = issuer.replace(/\/+$/, "");
  if (trimmed.endsWith("/.well-known/openid-configuration")) {
    return trimmed;
  }
  return `${trimmed}/.well-known/openid-configuration`;
};

export const resolveOidc = (input: {
  issuer?: string | undefined;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  scopes?: string | undefined;
}): ResolvedOidc => {
  const issuer = presentEnv(input.issuer);
  const clientId = presentEnv(input.clientId);
  const clientSecret = presentEnv(input.clientSecret);
  const missing = [
    issuer === undefined ? "OIDC_ISSUER" : undefined,
    clientId === undefined ? "OIDC_CLIENT_ID" : undefined,
    clientSecret === undefined ? "OIDC_CLIENT_SECRET" : undefined,
  ].filter((name): name is string => name !== undefined);

  if (missing.length === 3) {
    return { _tag: "off" };
  }
  if (missing.length > 0) {
    return { _tag: "incomplete", missing };
  }
  if (
    issuer === undefined ||
    clientId === undefined ||
    clientSecret === undefined
  ) {
    return { _tag: "off" };
  }

  return {
    _tag: "on",
    settings: {
      issuer,
      discoveryUrl: toOidcDiscoveryUrl(issuer),
      clientId,
      clientSecret,
      scopes: parseOidcScopes(input.scopes),
    },
  };
};

export const oidcIncompleteMessage = (missing: readonly string[]): string =>
  `OIDC is partially configured. Set all of OIDC_ISSUER, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET (missing: ${missing.join(", ")}).`;

export const isTruthyEnv = (value: string | undefined): boolean => {
  const normalized = presentEnv(value)?.toLowerCase();
  return (
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on" ||
    normalized === "1" ||
    normalized === "y"
  );
};

export const publicAuthSettings = (input: {
  issuer?: string | undefined;
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  scopes?: string | undefined;
  disableSignup?: string | undefined | boolean;
}): AuthSettings => {
  const oidc = resolveOidc(input);
  const signupEnabled =
    typeof input.disableSignup === "boolean"
      ? !input.disableSignup
      : !isTruthyEnv(input.disableSignup);
  return new AuthSettings({
    oidcEnabled: oidc._tag === "on",
    signupEnabled,
    ...(oidc._tag === "on" ? { oidcProviderId: OIDC_PROVIDER_ID } : {}),
  });
};

export const resolveOidcFromConfig = (config: {
  oidcIssuer: Option.Option<string>;
  oidcClientId: Option.Option<Redacted.Redacted<string>>;
  oidcClientSecret: Option.Option<Redacted.Redacted<string>>;
  oidcScopes: string;
}): ResolvedOidc =>
  resolveOidc({
    issuer: Option.getOrUndefined(config.oidcIssuer),
    clientId: Option.getOrUndefined(
      Option.map(config.oidcClientId, Redacted.value),
    ),
    clientSecret: Option.getOrUndefined(
      Option.map(config.oidcClientSecret, Redacted.value),
    ),
    scopes: config.oidcScopes,
  });
