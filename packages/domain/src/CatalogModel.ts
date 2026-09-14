import { Schema } from "effect";
import { ReasoningEffort } from "./ReasoningEffort";

export class CatalogModel extends Schema.Class<CatalogModel>("CatalogModel")({
  id: Schema.String,
  company: Schema.String,
  name: Schema.String,
  iconColor: Schema.String,
  efforts: Schema.optionalKey(Schema.Array(ReasoningEffort)),
  defaultEffort: Schema.optionalKey(ReasoningEffort),
  contextLength: Schema.optionalKey(Schema.Number),
  promptUsdPerMillion: Schema.optionalKey(Schema.Number),
}) {}
