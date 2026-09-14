const MILLION = 1_000_000;
const THOUSAND = 1_000;

export const formatContextLength = (tokens: number): string => {
  if (tokens >= MILLION) {
    const millions = tokens / MILLION;
    return `${formatCompact(millions)}M`;
  }
  if (tokens >= THOUSAND) {
    return `${formatCompact(tokens / THOUSAND, 1)}K`;
  }
  return String(tokens);
};

export const formatPromptPrice = (usdPerMillion: number): string => {
  if (usdPerMillion <= 0) {
    return "Free";
  }
  return `$${formatCompact(usdPerMillion)}/M`;
};

const formatCompact = (value: number, maxDecimals = 2): string => {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(maxDecimals).replace(/\.?0+$/, "");
};

export const modelRowMeta = (model: {
  readonly contextLength?: number;
  readonly promptUsdPerMillion?: number;
}): { readonly context?: string; readonly price?: string } => ({
  ...(model.contextLength === undefined
    ? {}
    : { context: formatContextLength(model.contextLength) }),
  ...(model.promptUsdPerMillion === undefined
    ? {}
    : { price: formatPromptPrice(model.promptUsdPerMillion) }),
});
