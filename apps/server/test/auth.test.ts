import { expect, test } from "bun:test";
import { createAuth } from "../src/shared/auth";
import { oidcEndpointsFromIssuer } from "../src/shared/auth-options";

if (process.env.DATABASE_URL === undefined) {
  process.env.DATABASE_URL =
    "postgres://openrouter:openrouter@localhost:5432/openrouter";
}

const SECRET = "test-secret-that-is-at-least-32-chars-long";
const BASE_URL = "http://localhost:3000";

const sampleOidc = {
  issuer: "https://sso.example.com",
  ...oidcEndpointsFromIssuer("https://sso.example.com"),
  clientId: "client",
  clientSecret: "secret",
  scopes: ["openid", "email", "profile"] as const,
};

const genericOAuthConfig = (auth: ReturnType<typeof createAuth>) => {
  const plugin = auth.options.plugins.find(
    (entry) => entry.id === "generic-oauth",
  );
  if (plugin === undefined || plugin.options === undefined) {
    throw new Error("generic-oauth plugin is missing");
  }
  const [config] = plugin.options.config;
  if (config === undefined) {
    throw new Error("generic-oauth config is missing");
  }
  return config;
};

test("AUTH_DISABLE_SIGNUP still blocks email sign-up", () => {
  const auth = createAuth(SECRET, BASE_URL, { disableSignup: true });
  expect(auth.options.emailAndPassword?.disableSignUp).toBe(true);
});

test("AUTH_DISABLE_SIGNUP does not block first-time OIDC SSO sign-up", () => {
  const auth = createAuth(SECRET, BASE_URL, {
    disableSignup: true,
    oidc: sampleOidc,
  });
  expect(genericOAuthConfig(auth).disableSignUp).not.toBe(true);
});
