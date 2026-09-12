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
import { trustedOrigins } from "./origins";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://openrouter:openrouter@localhost:5432/openrouter";

const db = createAuthDb(databaseUrl);

const authSchema = { user, session, account, verification };

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
