import { type Href, Link } from "expo-router";
import { useState } from "react";
import { Button, H2, Input, Paragraph, Text, YStack } from "tamagui";
import { authClient } from "../shared/auth-client";
import { formatRpcError } from "../shared/errors";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await authClient.signIn.email({
        email,
        password,
        fetchOptions: { signal: AbortSignal.timeout(8_000) },
      });
      if (result.error) {
        setError(result.error.message ?? "Could not sign in.");
      }
    } catch (failure) {
      setError(formatRpcError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <YStack flex={1} p="$4" gap="$3" bg="$background" justify="center">
      <H2>Sign in</H2>
      <Input
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
      />
      <Input
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error !== undefined ? (
        <Paragraph color="$red10">{error}</Paragraph>
      ) : null}
      <Button disabled={busy} onPress={() => void onSubmit()}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      <Text>
        Need an account?{" "}
        <Link href={"/sign-up" as Href}>
          <Text color="$blue10">Sign up</Text>
        </Link>
      </Text>
    </YStack>
  );
}
