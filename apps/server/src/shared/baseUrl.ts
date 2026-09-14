export const DEFAULT_BASE_URL = "http://localhost:3000";

export const trimTrailingSlash = (url: string): string =>
  url.replace(/\/+$/, "");
