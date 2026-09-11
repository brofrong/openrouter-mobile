import {
  AppError,
  GenerationJob,
  GenerationJobId,
  JobEvent,
} from "@openrouter-mobile/domain";
import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";

export class JobRpcs extends RpcGroup.make(
  Rpc.make("JobGet", {
    payload: { jobId: GenerationJobId },
    success: GenerationJob,
    error: AppError,
  }),
  Rpc.make("JobSubscribe", {
    payload: {
      jobId: GenerationJobId,
      afterSeq: Schema.optionalKey(Schema.Number),
    },
    success: JobEvent,
    error: AppError,
    stream: true,
  }),
) {}
