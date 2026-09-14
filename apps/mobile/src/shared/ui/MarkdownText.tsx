// biome-ignore-all lint/suspicious/noArrayIndexKey: markdown tokens have no stable ids
import * as Linking from "expo-linking";
import { lexer, type Token, type Tokens } from "marked";
import { useMemo } from "react";
import { Platform } from "react-native";
import { Text, XStack, YStack } from "tamagui";
import { hrefForMarkdownLink } from "../markdown-link";
import { CopyIconButton } from "./CopyIconButton";
import { SelectableText } from "./SelectableText";

const MARKDOWN_OPTIONS = { breaks: true, gfm: true } as const;

const MONO = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
});

const HEADING_SIZE = {
  1: 22,
  2: 20,
  3: 18,
  4: 16,
  5: 15,
  6: 14,
} as const;

type MarkdownTextProps = {
  readonly content: string;
};

const childTokens = (token: Token): ReadonlyArray<Token> =>
  "tokens" in token && Array.isArray(token.tokens) ? token.tokens : [];

export function MarkdownText({ content }: MarkdownTextProps) {
  const tokens = useMemo(() => lexer(content, MARKDOWN_OPTIONS), [content]);

  return (
    <YStack gap="$2" mt="$1">
      {tokens.map((token, index) => (
        <BlockToken key={`${token.type}-${index}`} token={token} />
      ))}
    </YStack>
  );
}

function BlockToken({ token }: { readonly token: Token }) {
  switch (token.type) {
    case "space":
    case "def":
    case "checkbox":
      return null;
    case "heading":
      return (
        <SelectableText
          fontSize={
            HEADING_SIZE[
              (token as Tokens.Heading).depth as keyof typeof HEADING_SIZE
            ] ?? 16
          }
          fontWeight="700"
          mt="$2"
        >
          <InlineTokens tokens={childTokens(token)} />
        </SelectableText>
      );
    case "paragraph":
      return (
        <SelectableText>
          <InlineTokens tokens={childTokens(token)} />
        </SelectableText>
      );
    case "text":
      return (
        <SelectableText>
          {childTokens(token).length > 0 ? (
            <InlineTokens tokens={childTokens(token)} />
          ) : (
            (token as Tokens.Text).text
          )}
        </SelectableText>
      );
    case "code":
      return <CodeBlock token={token as Tokens.Code} />;
    case "blockquote":
      return (
        <XStack gap="$3" my="$1">
          <YStack bg="$color8" rounded={2} width={3} />
          <YStack flex={1} gap="$2">
            {childTokens(token).map((child, index) => (
              <BlockToken key={`${child.type}-${index}`} token={child} />
            ))}
          </YStack>
        </XStack>
      );
    case "list":
      return <MarkdownList token={token as Tokens.List} />;
    case "table":
      return <MarkdownTable token={token as Tokens.Table} />;
    case "hr":
      return <YStack bg="$color6" height={1} my="$2" />;
    case "html":
      return <SelectableText>{(token as Tokens.HTML).text}</SelectableText>;
    default:
      return token.raw.length > 0 ? (
        <SelectableText>{token.raw}</SelectableText>
      ) : null;
  }
}

function MarkdownList({ token }: { readonly token: Tokens.List }) {
  return (
    <YStack gap="$1.5" pl="$2">
      {token.items.map((item, index) => (
        <XStack gap="$2" key={`${item.raw}-${index}`}>
          <YStack width={22}>
            <SelectableText>{listMarker(token, item, index)}</SelectableText>
          </YStack>
          <YStack flex={1} gap="$1">
            {item.tokens.map((child, childIndex) => (
              <BlockToken key={`${child.type}-${childIndex}`} token={child} />
            ))}
          </YStack>
        </XStack>
      ))}
    </YStack>
  );
}

function listMarker(
  list: Tokens.List,
  item: Tokens.ListItem,
  index: number,
): string {
  if (item.task) {
    return item.checked === true ? "☑" : "☐";
  }
  if (list.ordered) {
    const start = list.start === "" ? 1 : list.start;
    return `${start + index}.`;
  }
  return "•";
}

function MarkdownTable({ token }: { readonly token: Tokens.Table }) {
  return (
    <YStack bg="$color6" overflow="hidden" p={1} rounded="$2">
      <XStack bg="$color4">
        {token.header.map((cell, index) => (
          <YStack flex={1} key={`h-${cell.text}-${index}`} minW={72} p="$2">
            <SelectableText fontWeight="700">
              <InlineTokens tokens={cell.tokens} />
            </SelectableText>
          </YStack>
        ))}
      </XStack>
      {token.rows.map((row, rowIndex) => (
        <XStack
          bg={rowIndex % 2 === 0 ? "$background" : "$color2"}
          key={`r-${rowIndex}`}
        >
          {row.map((cell, cellIndex) => (
            <YStack
              flex={1}
              key={`c-${rowIndex}-${cellIndex}`}
              minW={72}
              p="$2"
            >
              <SelectableText>
                <InlineTokens tokens={cell.tokens} />
              </SelectableText>
            </YStack>
          ))}
        </XStack>
      ))}
    </YStack>
  );
}

function CodeBlock({ token }: { readonly token: Tokens.Code }) {
  return (
    <YStack bg="$color4" overflow="hidden" rounded="$3">
      <XStack items="center" justify="space-between" px="$2" py="$1">
        <Text color="$color10" fontSize={12}>
          {token.lang ?? "code"}
        </Text>
        <CopyIconButton accessibilityLabel="Copy code" text={token.text} />
      </XStack>
      <SelectableText p="$2" style={{ fontFamily: MONO }} fontSize={13}>
        {token.text}
      </SelectableText>
    </YStack>
  );
}

function InlineTokens({ tokens }: { readonly tokens: ReadonlyArray<Token> }) {
  return tokens.map((token, index) => (
    <InlineToken key={`${token.type}-${index}`} token={token} />
  ));
}

function InlineToken({ token }: { readonly token: Token }) {
  switch (token.type) {
    case "text":
      return childTokens(token).length > 0 ? (
        <InlineTokens tokens={childTokens(token)} />
      ) : (
        <Text>{(token as Tokens.Text).text}</Text>
      );
    case "strong":
    case "em":
    case "del": {
      const style =
        token.type === "strong"
          ? { fontWeight: "700" as const }
          : token.type === "em"
            ? { fontStyle: "italic" as const }
            : { textDecorationLine: "line-through" as const };
      return (
        <Text {...style}>
          <InlineTokens tokens={childTokens(token)} />
        </Text>
      );
    }
    case "codespan":
      return (
        <Text bg="$color5" px={4} rounded={4} style={{ fontFamily: MONO }}>
          {(token as Tokens.Codespan).text}
        </Text>
      );
    case "link": {
      const link = token as Tokens.Link;
      const href = hrefForMarkdownLink(link.href);
      return (
        <Text
          color="$blue10"
          onPress={
            href === undefined
              ? undefined
              : () => {
                  void Linking.openURL(href);
                }
          }
          textDecorationLine="underline"
        >
          <InlineTokens tokens={childTokens(link)} />
        </Text>
      );
    }
    case "image":
      return <Text>{(token as Tokens.Image).text}</Text>;
    case "br":
      return <Text>{"\n"}</Text>;
    case "escape":
    case "html":
      return <Text>{(token as Tokens.Escape | Tokens.HTML).text}</Text>;
    default:
      return token.raw.length > 0 ? <Text>{token.raw}</Text> : null;
  }
}
