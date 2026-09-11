import { Layer } from "effect";
import { DurableStream, makeDurableStream } from "./DurableStream";

export const DurableStreamLive = Layer.effect(DurableStream, makeDurableStream);
