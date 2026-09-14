import { Button } from "tamagui";
import { authClient } from "../auth-client";

export function SignOutButton() {
  return (
    <Button
      onPress={() => {
        void authClient.signOut();
      }}
    >
      Sign out
    </Button>
  );
}
