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

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://openrouter:openrouter@localhost:5432/openrouter";

const db = createAuthDb(databaseUrl);

const authSchema = { user, session, account, verification };

const trustedOrigins = [
  "openrouter-mobile://",
  "http://localhost:8081",
  "http://localhost:3000",
  ...(process.env.NODE_ENV === "production"
    ? []
    : ["exp://", "exp://**", "exp://192.168.*.*:*/**"]),
];

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [expo()],
  trustedOrigins,
});

export type Session = typeof auth.$Infer.Session;
