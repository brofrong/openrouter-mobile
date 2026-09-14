import { type Href, useRouter } from "expo-router";
import { Pressable } from "react-native";
import { UserAvatar } from "../../entities/user/UserAvatar";
import { authClient } from "../../shared/auth-client";

export function UserAvatarButton() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = session?.user;

  if (user === undefined) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel="Open profile"
      accessibilityRole="button"
      hitSlop={8}
      onPress={() => {
        router.push("/profile" as Href);
      }}
      style={{ paddingHorizontal: 12 }}
    >
      <UserAvatar
        email={user.email}
        image={user.image}
        name={user.name}
        size={32}
      />
    </Pressable>
  );
}
