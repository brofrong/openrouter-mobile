import type { OutputModality } from "@openrouter-mobile/domain";
import { Effect } from "effect";
import { RpcHttp } from "../../shared/rpc";
import { mobileRuntime } from "../../shared/runtime";

export const loadCatalogPage = (
  outputModality: OutputModality,
  args: {
    readonly query: string;
    readonly offset: number;
    readonly limit: number;
  },
) =>
  mobileRuntime.runPromise(
    Effect.gen(function* () {
      const rpc = yield* RpcHttp;
      return yield* rpc.ModelsList({
        offset: args.offset,
        limit: args.limit,
        outputModality,
        ...(args.query.length > 0 ? { query: args.query } : {}),
      });
    }),
  );
