import { DEFAULT_BASE_URL, trimTrailingSlash } from "./baseUrl";

const expoWebPorts = [
  8081, 8082, 8083, 8084, 8085, 8086, 8087, 8088, 8089, 8090, 19006,
] as const;

export const expoWebOrigins = expoWebPorts.flatMap((port) => [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
]);

export const corsAllowedOrigins: ReadonlyArray<string> = expoWebOrigins;

export const makeTrustedOrigins = (baseUrl: string): Array<string> => {
  const origins = new Set<string>([
    "openrouter-mobile://",
    trimTrailingSlash(baseUrl),
    DEFAULT_BASE_URL,
    ...expoWebOrigins,
  ]);
  if (process.env.NODE_ENV !== "production") {
    origins.add("exp://");
    origins.add("exp://**");
    origins.add("exp://192.168.*.*:*/**");
    origins.add("http://localhost:*");
    origins.add("http://127.0.0.1:*");
  }
  return [...origins];
};
