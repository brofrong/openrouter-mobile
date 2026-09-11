import { Config, Redacted } from "effect";
import { DEFAULT_OPENROUTER_MODEL } from "./openrouter";

const defaultDatabaseUrl =
  "postgres://openrouter:openrouter@localhost:5432/openrouter";

export const AppConfig = Config.all({
  databaseUrl: Config.Redacted("DATABASE_URL").pipe(
    Config.withDefault(Redacted.make(defaultDatabaseUrl)),
  ),
  port: Config.Port("PORT").pipe(Config.withDefault(3000)),
  betterAuthSecret: Config.Redacted("BETTER_AUTH_SECRET"),
  betterAuthUrl: Config.String("BETTER_AUTH_URL").pipe(
    Config.withDefault("http://localhost:3000"),
  ),
  openRouterApiKey: Config.option(Config.Redacted("OPENROUTER_API_KEY")),
  openRouterModel: Config.String("OPENROUTER_MODEL").pipe(
    Config.withDefault(DEFAULT_OPENROUTER_MODEL),
  ),
});
