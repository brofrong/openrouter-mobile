import { type Href, Link } from "expo-router";
import { useState } from "react";
import { Button, H2, Input, Paragraph, Text, YStack } from "tamagui";
import { authClient } from "../shared/auth-client";
import { formatRpcError } from "../shared/errors";

export default function SignUpScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
        fetchOptions: { signal: AbortSignal.timeout(8_000) },
      });
      if (result.error) {
        setError(result.error.message ?? "Could not sign up.");
      }
    } catch (failure) {
      setError(formatRpcError(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <YStack flex={1} p="$4" gap="$3" bg="$background" justify="center">
      <H2>Sign up</H2>
      <Input placeholder="Name" value={name} onChangeText={setName} />
      <Input
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
      />
      <Input
        placeholder="Password (min 8 characters)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error !== undefined ? (
        <Paragraph color="$red10">{error}</Paragraph>
      ) : null}
      <Button disabled={busy} onPress={() => void onSubmit()}>
        {busy ? "Creating account…" : "Create account"}
      </Button>
      <Text>
        Already have an account?{" "}
        <Link href={"/sign-in" as Href}>
          <Text color="$blue10">Sign in</Text>
        </Link>
      </Text>
    </YStack>
  );
}
