import { Button } from "tamagui";
import { authClient } from "../auth-client";

export function SignOutButton() {
  return (
    <Button
      chromeless
      size="$3"
      onPress={() => {
        void authClient.signOut();
      }}
    >
      Sign out
    </Button>
  );
}
