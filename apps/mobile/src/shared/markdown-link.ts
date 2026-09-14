const SAFE_HREF = /^(https?:\/\/|mailto:)/i;

export const hrefForMarkdownLink = (href: string): string | undefined => {
  const trimmed = href.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (SAFE_HREF.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (/^www\./i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return undefined;
};
