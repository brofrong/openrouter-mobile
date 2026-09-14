import { Image } from "react-native";
import { Text, YStack } from "tamagui";
import { userInitials } from "./initials";

type UserAvatarProps = {
  readonly name: string;
  readonly email: string;
  readonly image?: string | null;
  readonly size: number;
};

export function UserAvatar({ name, email, image, size }: UserAvatarProps) {
  const initials = userInitials(name, email);
  if (image !== undefined && image !== null && image.length > 0) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: image }}
        style={{
          borderRadius: size / 2,
          height: size,
          width: size,
        }}
      />
    );
  }

  return (
    <YStack
      bg="$color5"
      height={size}
      items="center"
      justify="center"
      rounded={size / 2}
      width={size}
    >
      <Text fontSize={size * 0.38} fontWeight="600">
        {initials}
      </Text>
    </YStack>
  );
}
