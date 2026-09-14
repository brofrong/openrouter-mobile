import { Schema } from "effect";
import { CatalogModel } from "./CatalogModel";

export class CatalogModelPage extends Schema.Class<CatalogModelPage>(
  "CatalogModelPage",
)({
  models: Schema.Array(CatalogModel),
  hasMore: Schema.Boolean,
  total: Schema.Number,
}) {}
