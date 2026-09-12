export const expoWebOrigins = [
  "http://localhost:8081",
  "http://127.0.0.1:8081",
  "http://localhost:8082",
  "http://127.0.0.1:8082",
  "http://localhost:19006",
  "http://127.0.0.1:19006",
] as const;

export const corsAllowedOrigins: ReadonlyArray<string> = expoWebOrigins;

export const trustedOrigins: ReadonlyArray<string> = [
  "openrouter-mobile://",
  "http://localhost:3000",
  ...expoWebOrigins,
  ...(process.env.NODE_ENV === "production"
    ? []
    : ["exp://", "exp://**", "exp://192.168.*.*:*/**"]),
];
