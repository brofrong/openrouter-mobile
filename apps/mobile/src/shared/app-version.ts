export const formatAppVersion = (version: string | undefined): string => {
  const trimmed = version?.trim();
  return `Version ${trimmed && trimmed.length > 0 ? trimmed : "0.0.0"}`;
};
