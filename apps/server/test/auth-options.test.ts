import { expect, test } from "bun:test";
import { AuthSettings, OIDC_PROVIDER_ID } from "@openrouter-mobile/domain";
import { ConfigProvider, Effect } from "effect";
import {
  oidcIncompleteMessage,
  parseOidcScopes,
  publicAuthSettings,
  resolveOidc,
  toOidcDiscoveryUrl,
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
      discoveryUrl: "https://sso.example.com/.well-known/openid-configuration",
      clientId: "client",
      clientSecret: "secret",
      scopes: ["openid", "profile"],
    },
  });
});

test("toOidcDiscoveryUrl keeps an explicit discovery URL", () => {
  expect(
    toOidcDiscoveryUrl(
      "https://sso.example.com/realms/app/.well-known/openid-configuration",
    ),
  ).toBe("https://sso.example.com/realms/app/.well-known/openid-configuration");
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

test("oidcIncompleteMessage lists missing env names", () => {
  expect(oidcIncompleteMessage(["OIDC_CLIENT_SECRET"])).toContain(
    "OIDC_CLIENT_SECRET",
  );
});
