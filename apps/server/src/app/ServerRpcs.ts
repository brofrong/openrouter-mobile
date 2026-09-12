import {
  ChatRpcs,
  HealthRpcs,
  JobRpcs,
  MediaRpcs,
} from "@openrouter-mobile/rpc";
import { AuthMiddleware } from "../shared/AuthMiddleware";

export class ServerRpcs extends ChatRpcs.merge(JobRpcs, MediaRpcs)
  .middleware(AuthMiddleware)
  .merge(HealthRpcs) {}
