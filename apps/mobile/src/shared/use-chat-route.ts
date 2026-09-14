import type { ChatId } from "@openrouter-mobile/domain";
import { type Href, usePathname, useRouter } from "expo-router";
import {
  type ChatRouteKind,
  chatHref,
  chatIdFromPathname,
  pathnameBelongsToKind,
} from "./chat-route";

export const useChatRoute = (kind: ChatRouteKind) => {
  const router = useRouter();
  const pathname = usePathname();
  const belongsToKind = pathnameBelongsToKind(kind, pathname);
  const routeChatId = chatIdFromPathname(kind, pathname);

  const openChat = (chatId?: ChatId) => {
    router.replace(chatHref(kind, chatId) as Href);
  };

  return { belongsToKind, routeChatId, openChat };
};
