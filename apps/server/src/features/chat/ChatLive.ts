import { Effect } from "effect";
import { ServerRpcs } from "../../app/ServerRpcs";

export const ChatLive = ServerRpcs.toLayerHandler("ChatList", () =>
  Effect.succeed([]),
);
