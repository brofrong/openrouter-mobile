import { OIDC_PROVIDER_ID } from "@openrouter-mobile/domain";
import { type Href, Link } from "expo-router";
import { useState } from "react";
import { Button, H2, Input, Paragraph, Text, YStack } from "tamagui";
import { authClient } from "../shared/auth-client";
import { useAuthSettings } from "../shared/auth-settings";
import { formatRpcError } from "../shared/errors";

export default function SignInScreen() {
  const { settings, loading, error: settingsError } = useAuthSettings();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const onEmailSubmit = async () => {
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

  const onOidcSubmit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await authClient.signIn.social({
        provider: settings?.oidcProviderId ?? OIDC_PROVIDER_ID,
        callbackURL: "/",
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

  if (loading && settings === undefined) {
    return (
      <YStack flex={1} p="$4" gap="$3" bg="$background" justify="center">
        <Paragraph>Loading sign-in…</Paragraph>
      </YStack>
    );
  }

  if (settings?.oidcEnabled === true) {
    return (
      <YStack flex={1} p="$4" gap="$3" bg="$background" justify="center">
        <H2>Sign in</H2>
        <Paragraph>
          This app uses your organization SSO. Email and password sign-in is
          disabled.
        </Paragraph>
        {error !== undefined ? (
          <Paragraph color="$red10">{error}</Paragraph>
        ) : null}
        {settingsError !== undefined ? (
          <Paragraph color="$red10">{settingsError}</Paragraph>
        ) : null}
        <Button disabled={busy} onPress={() => void onOidcSubmit()}>
          {busy ? "Redirecting…" : "Continue with SSO"}
        </Button>
      </YStack>
    );
  }

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
      {settingsError !== undefined ? (
        <Paragraph color="$red10">{settingsError}</Paragraph>
      ) : null}
      <Button disabled={busy} onPress={() => void onEmailSubmit()}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      {settings?.signupEnabled !== false ? (
        <Text>
          Need an account?{" "}
          <Link href={"/sign-up" as Href}>
            <Text color="$blue10">Sign up</Text>
          </Link>
        </Text>
      ) : null}
    </YStack>
  );
}
