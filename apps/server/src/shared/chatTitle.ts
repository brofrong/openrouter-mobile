import { CHAT_TITLE_MAX_LENGTH } from "@openrouter-mobile/domain";
import type { OpenRouterMessage } from "./openrouter";

export const titleSummaryMessages = (
  content: string,
): ReadonlyArray<OpenRouterMessage> => [
  {
    role: "system",
    content:
      "You name chats. Reply with only a short title that summarizes the user's first message. Maximum 50 characters. No quotes, no explanation, no trailing punctuation. Use the same language as the user.",
  },
  { role: "user", content },
];

export const sanitizeChatTitle = (raw: string): string | undefined => {
  const cleaned = raw
    .replace(/[\r\n]+/g, " ")
    .replace(/^[\s"'«»„“”‘’`]+|[\s"'«»„“”‘’`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length === 0) {
    return undefined;
  }
  if (cleaned.length <= CHAT_TITLE_MAX_LENGTH) {
    return cleaned;
  }
  return cleaned.slice(0, CHAT_TITLE_MAX_LENGTH).trim();
};
