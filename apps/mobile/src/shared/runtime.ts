import { Layer, ManagedRuntime } from "effect";
import { RpcLive } from "./rpc";

export const MobileLive = Layer.mergeAll(RpcLive);

export const mobileRuntime = ManagedRuntime.make(MobileLive);
