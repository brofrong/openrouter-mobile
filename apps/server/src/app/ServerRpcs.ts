import {
  AiConfigRpcs,
  ChatRpcs,
  HealthRpcs,
  JobRpcs,
  MediaRpcs,
  UsageRpcs,
} from "@openrouter-mobile/rpc";
import { AuthMiddleware } from "../shared/AuthMiddleware";

export class ServerRpcs extends ChatRpcs.merge(
  JobRpcs,
  MediaRpcs,
  UsageRpcs,
  AiConfigRpcs,
)
  .middleware(AuthMiddleware)
  .merge(HealthRpcs) {}
