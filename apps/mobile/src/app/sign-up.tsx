import { type Href, Link, Redirect } from "expo-router";
import { useState } from "react";
import { Button, H2, Input, Paragraph, Text, YStack } from "tamagui";
import { authClient } from "../shared/auth-client";
import { useAuthSettings } from "../shared/auth-settings";
import { formatRpcError } from "../shared/errors";
import { KeyboardScreen } from "../shared/ui/KeyboardScreen";

export default function SignUpScreen() {
  const { settings, loading, error: settingsError } = useAuthSettings();
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

  if (loading && settings === undefined) {
    return (
      <KeyboardScreen behavior="padding">
        <YStack flex={1} p="$4" gap="$3" justify="center">
          <Paragraph>Loading…</Paragraph>
        </YStack>
      </KeyboardScreen>
    );
  }

  if (
    settings !== undefined &&
    (settings.oidcEnabled || !settings.signupEnabled)
  ) {
    return <Redirect href={"/sign-in" as Href} />;
  }

  return (
    <KeyboardScreen behavior="padding">
      <YStack flex={1} p="$4" gap="$3" justify="center">
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
          autoComplete="new-password"
          placeholder="Password (min 8 characters)"
          secureTextEntry
          type="password"
          value={password}
          onChangeText={setPassword}
        />
        {error !== undefined ? (
          <Paragraph color="$red10">{error}</Paragraph>
        ) : null}
        {settingsError !== undefined ? (
          <Paragraph color="$red10">{settingsError}</Paragraph>
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
    </KeyboardScreen>
  );
}
