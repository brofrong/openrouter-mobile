import { H2, Paragraph, YStack } from "tamagui";

type PlaceholderScreenProps = {
  title: string;
  description: string;
};

export function PlaceholderScreen({
  title,
  description,
}: PlaceholderScreenProps) {
  return (
    <YStack flex={1} p="$4" gap="$3" bg="$background">
      <H2>{title}</H2>
      <Paragraph>{description}</Paragraph>
    </YStack>
  );
}
