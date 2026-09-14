import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";
import { authRelations } from "./schema/auth";

export const appRelations = defineRelations(schema, (r) => ({
  chats: {
    messages: r.many.messages(),
    jobs: r.many.generationJobs({
      from: r.generationJobs.chatId,
      to: r.chats.id,
    }),
    user: r.one.user({
      from: r.chats.userId,
      to: r.user.id,
      optional: false,
    }),
  },
  messages: {
    chat: r.one.chats({
      from: r.messages.chatId,
      to: r.chats.id,
      optional: false,
    }),
  },
  generationJobs: {
    chat: r.one.chats({
      from: r.generationJobs.chatId,
      to: r.chats.id,
    }),
    user: r.one.user({
      from: r.generationJobs.userId,
      to: r.user.id,
      optional: false,
    }),
  },
  usageEvents: {
    user: r.one.user({
      from: r.usageEvents.userId,
      to: r.user.id,
      optional: false,
    }),
  },
  userAiConfigs: {
    user: r.one.user({
      from: r.userAiConfigs.userId,
      to: r.user.id,
      optional: false,
    }),
  },
}));

export const relations = { ...appRelations, ...authRelations };
