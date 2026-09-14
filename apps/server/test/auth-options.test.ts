import { expect, test } from "bun:test";
import { AuthSettings, OIDC_PROVIDER_ID } from "@openrouter-mobile/domain";
import { ConfigProvider, Effect } from "effect";
import {
  oidcEndpointsFromIssuer,
  oidcIncompleteMessage,
  parseOidcScopes,
  publicAuthSettings,
  publicAuthSettingsFromConfig,
  resolveOidc,
} from "../src/shared/auth-options";
import { AppConfig } from "../src/shared/config";

const parseConfig = (env: Record<string, string>) =>
  Effect.runSync(
    AppConfig.pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown(env),
      ),
    ),
  );

test("resolveOidc is off when no OIDC env is set", () => {
  expect(resolveOidc({})).toEqual({ _tag: "off" });
});

test("resolveOidc reports missing fields when only some are set", () => {
  expect(
    resolveOidc({
      issuer: "https://sso.example.com",
    }),
  ).toEqual({
    _tag: "incomplete",
    missing: ["OIDC_CLIENT_ID", "OIDC_CLIENT_SECRET"],
  });
});

test("resolveOidc enables OIDC when issuer, client id, and secret are set", () => {
  expect(
    resolveOidc({
      issuer: "https://sso.example.com/",
      clientId: "client",
      clientSecret: "secret",
      scopes: "openid, profile",
    }),
  ).toEqual({
    _tag: "on",
    settings: {
      issuer: "https://sso.example.com/",
      authorizationUrl: "https://sso.example.com/authorize",
      tokenUrl: "https://sso.example.com/api/oidc/token",
      userInfoUrl: "https://sso.example.com/api/oidc/userinfo",
      clientId: "client",
      clientSecret: "secret",
      scopes: ["openid", "profile"],
    },
  });
});

test("oidcEndpointsFromIssuer strips trailing slashes", () => {
  expect(oidcEndpointsFromIssuer("https://sso.example.com/")).toEqual({
    authorizationUrl: "https://sso.example.com/authorize",
    tokenUrl: "https://sso.example.com/api/oidc/token",
    userInfoUrl: "https://sso.example.com/api/oidc/userinfo",
  });
});

test("parseOidcScopes falls back to openid email profile", () => {
  expect(parseOidcScopes("")).toEqual(["openid", "email", "profile"]);
  expect(parseOidcScopes("openid email")).toEqual(["openid", "email"]);
});

test("AppConfig.authDisableSignup defaults to false", () => {
  expect(parseConfig({}).authDisableSignup).toBe(false);
});

test("AppConfig.authDisableSignup reads AUTH_DISABLE_SIGNUP", () => {
  expect(parseConfig({ AUTH_DISABLE_SIGNUP: "true" }).authDisableSignup).toBe(
    true,
  );
});

test("publicAuthSettings defaults to email/password with signup", () => {
  expect(publicAuthSettings({})).toEqual(
    new AuthSettings({
      oidcEnabled: false,
      signupEnabled: true,
    }),
  );
});

test("publicAuthSettings exposes OIDC-only public flags", () => {
  const settings = publicAuthSettings({
    issuer: "https://sso.example.com",
    clientId: "client",
    clientSecret: "secret",
    disableSignup: "true",
  });
  expect(settings).toEqual(
    new AuthSettings({
      oidcEnabled: true,
      signupEnabled: false,
      oidcProviderId: OIDC_PROVIDER_ID,
    }),
  );
});

test("publicAuthSettingsFromConfig matches AppConfig OIDC flags", () => {
  expect(
    publicAuthSettingsFromConfig(
      parseConfig({
        OIDC_ISSUER: "https://sso.example.com",
        OIDC_CLIENT_ID: "client",
        OIDC_CLIENT_SECRET: "secret",
        AUTH_DISABLE_SIGNUP: "true",
      }),
    ),
  ).toEqual(
    new AuthSettings({
      oidcEnabled: true,
      signupEnabled: false,
      oidcProviderId: OIDC_PROVIDER_ID,
    }),
  );
});

test("oidcIncompleteMessage lists missing env names", () => {
  expect(oidcIncompleteMessage(["OIDC_CLIENT_SECRET"])).toContain(
    "OIDC_CLIENT_SECRET",
  );
});
