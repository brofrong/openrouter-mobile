import { ChatRpcs, HealthRpcs } from "@openrouter-mobile/rpc";
import { AuthMiddleware } from "../shared/AuthMiddleware";

export class ServerRpcs extends ChatRpcs.omit(
  "ChatCreate",
  "ChatMessages",
  "ChatSend",
  "ChatSubscribe",
)
  .middleware(AuthMiddleware)
  .merge(HealthRpcs) {}
