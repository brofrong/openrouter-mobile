import type { ComponentProps } from "react";
import { Text } from "tamagui";

export function SelectableText(props: ComponentProps<typeof Text>) {
  return <Text cursor="text" {...props} select="text" />;
}
