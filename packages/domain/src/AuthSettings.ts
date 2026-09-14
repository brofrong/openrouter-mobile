import { Schema } from "effect";

export const OIDC_PROVIDER_ID = "oidc";

export class AuthSettings extends Schema.Class<AuthSettings>("AuthSettings")({
  oidcEnabled: Schema.Boolean,
  signupEnabled: Schema.Boolean,
  oidcProviderId: Schema.optionalKey(Schema.String),
}) {}
