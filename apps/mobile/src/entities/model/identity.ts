export type ModelIdentity = {
  readonly id: string;
  readonly company: string;
  readonly name: string;
  readonly iconColor: string;
};

export const DEFAULT_MODEL_ICON_COLOR = "#6B7280";

export const unknownModelIdentity = (id: string): ModelIdentity => {
  const slash = id.indexOf("/");
  if (slash <= 0 || slash === id.length - 1) {
    return {
      id,
      company: "Unknown",
      name: id,
      iconColor: DEFAULT_MODEL_ICON_COLOR,
    };
  }
  return {
    id,
    company: id.slice(0, slash),
    name: id.slice(slash + 1),
    iconColor: DEFAULT_MODEL_ICON_COLOR,
  };
};
