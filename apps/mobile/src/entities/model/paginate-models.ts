export const MODEL_PAGE_SIZE = 30;

export const paginateModels = <
  T extends {
    readonly id: string;
    readonly company: string;
    readonly name: string;
  },
>(
  models: ReadonlyArray<T>,
  query: string,
  offset: number,
  limit = MODEL_PAGE_SIZE,
): {
  readonly models: ReadonlyArray<T>;
  readonly hasMore: boolean;
  readonly total: number;
} => {
  const needle = query.trim().toLowerCase();
  const filtered =
    needle.length === 0
      ? models
      : models.filter(
          (model) =>
            model.name.toLowerCase().includes(needle) ||
            model.company.toLowerCase().includes(needle) ||
            model.id.toLowerCase().includes(needle),
        );
  const safeOffset = Math.max(0, offset);
  const page = filtered.slice(safeOffset, safeOffset + limit);
  return {
    models: page,
    hasMore: safeOffset + page.length < filtered.length,
    total: filtered.length,
  };
};
