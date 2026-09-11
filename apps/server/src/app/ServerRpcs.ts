import { ChatRpcs, HealthRpcs } from "@openrouter-mobile/rpc";
import { AuthMiddleware } from "../shared/AuthMiddleware";

export class ServerRpcs extends ChatRpcs.middleware(AuthMiddleware).merge(
  HealthRpcs,
) {}
