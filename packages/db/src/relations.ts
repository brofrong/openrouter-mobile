import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
  chats: {
    messages: r.many.messages(),
  },
  messages: {
    chat: r.one.chats({
      from: r.messages.chatId,
      to: r.chats.id,
      optional: false,
    }),
  },
}));
