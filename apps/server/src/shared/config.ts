import { Config, Redacted } from "effect";
import { DEFAULT_BASE_URL, trimTrailingSlash } from "./baseUrl";
import { DEFAULT_OPENROUTER_MODEL } from "./openrouter";

const defaultDatabaseUrl =
  "postgres://openrouter:openrouter@localhost:5432/openrouter";

export const AppConfig = Config.all({
  databaseUrl: Config.Redacted("DATABASE_URL").pipe(
    Config.withDefault(Redacted.make(defaultDatabaseUrl)),
  ),
  port: Config.Port("PORT").pipe(Config.withDefault(3000)),
  baseUrl: Config.String("BASE_URL").pipe(
    Config.orElse(() => Config.String("BETTER_AUTH_URL")),
    Config.orElse(() => Config.String("EXPO_PUBLIC_BASE_URL")),
    Config.withDefault(DEFAULT_BASE_URL),
    Config.map(trimTrailingSlash),
  ),
  openRouterApiKey: Config.option(Config.Redacted("OPENROUTER_API_KEY")),
  openRouterModel: Config.String("OPENROUTER_MODEL").pipe(
    Config.withDefault(DEFAULT_OPENROUTER_MODEL),
  ),
  oidcIssuer: Config.option(Config.String("OIDC_ISSUER")),
  oidcClientId: Config.option(Config.Redacted("OIDC_CLIENT_ID")),
  oidcClientSecret: Config.option(Config.Redacted("OIDC_CLIENT_SECRET")),
  oidcScopes: Config.String("OIDC_SCOPES").pipe(
    Config.withDefault("openid email profile"),
  ),
  authDisableSignup: Config.Boolean("AUTH_DISABLE_SIGNUP").pipe(
    Config.withDefault(false),
  ),
  webDir: Config.String("WEB_DIR").pipe(Config.withDefault("/app/web")),
  s3Endpoint: Config.String("S3_ENDPOINT").pipe(
    Config.withDefault("http://localhost:9000"),
    Config.map(trimTrailingSlash),
  ),
  s3AccessKeyId: Config.String("S3_ACCESS_KEY_ID").pipe(
    Config.withDefault("openrouter"),
  ),
  s3SecretAccessKey: Config.Redacted("S3_SECRET_ACCESS_KEY").pipe(
    Config.withDefault(Redacted.make("openrouter")),
  ),
  s3Bucket: Config.String("S3_BUCKET").pipe(Config.withDefault("media")),
  s3Region: Config.String("S3_REGION").pipe(Config.withDefault("us-east-1")),
});
