import type { UsageRange, UsageSummary } from "@openrouter-mobile/domain";
import { Effect } from "effect";
import Constants from "expo-constants";
import {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  Button,
  H3,
  Input,
  Paragraph,
  ScrollView,
  Spinner,
  XStack,
  YStack,
} from "tamagui";
import { UserAvatar } from "../../entities/user/UserAvatar";
import { formatAppVersion } from "../../shared/app-version";
import { authClient } from "../../shared/auth-client";
import { formatRpcError } from "../../shared/errors";
import { RpcHttp } from "../../shared/rpc";
import { mobileRuntime } from "../../shared/runtime";
import { SignOutButton } from "../../shared/ui/SignOutButton";
import { AiConfigTab } from "./AiConfigTab";
import { AiUsageDashboard } from "./AiUsageDashboard";
import type { UsageMetric } from "./format-usage";

type ProfileTab = "profile" | "ai" | "ai-config";

const appVersionLabel = formatAppVersion(Constants.expoConfig?.version);

export function ProfileScreen() {
  const [tab, setTab] = useState<ProfileTab>("profile");

  return (
    <YStack bg="$background" flex={1}>
      <XStack gap="$2" p="$3">
        <Button
          flex={1}
          chromeless={tab !== "profile"}
          onPress={() => {
            setTab("profile");
          }}
        >
          Profile
        </Button>
        <Button
          flex={1}
          chromeless={tab !== "ai"}
          onPress={() => {
            setTab("ai");
          }}
        >
          AI
        </Button>
        <Button
          flex={1}
          chromeless={tab !== "ai-config"}
          onPress={() => {
            setTab("ai-config");
          }}
        >
          AI Config
        </Button>
      </XStack>
      {tab === "profile" ? (
        <ProfileTab />
      ) : tab === "ai" ? (
        <AiTab />
      ) : (
        <AiConfigTab />
      )}
    </YStack>
  );
}

function ProfileTab() {
  const { data: session } = authClient.useSession();
  const user = session?.user;
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [image, setImage] = useState(user?.image ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileError, setProfileError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [profileBusy, setProfileBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    setName(user?.name ?? "");
    setEmail(user?.email ?? "");
    setImage(user?.image ?? "");
  }, [user?.email, user?.image, user?.name]);

  if (user === undefined) {
    return (
      <YStack flex={1} items="center" justify="center">
        <Paragraph>Loading profile…</Paragraph>
      </YStack>
    );
  }

  const saveProfile = async () => {
    setProfileBusy(true);
    setProfileError(undefined);
    try {
      const nextName = name.trim();
      const nextEmail = email.trim();
      const nextImage = image.trim();
      if (nextName.length === 0) {
        setProfileError("Name is required.");
        return;
      }
      if (nextEmail.length === 0) {
        setProfileError("Email is required.");
        return;
      }
      const profileResult = await authClient.updateUser({
        name: nextName,
        ...(nextImage.length > 0 ? { image: nextImage } : { image: "" }),
      });
      if (profileResult.error) {
        setProfileError(
          profileResult.error.message ?? "Could not update profile.",
        );
        return;
      }
      if (nextEmail !== user.email) {
        const emailResult = await authClient.changeEmail({
          newEmail: nextEmail,
        });
        if (emailResult.error) {
          setProfileError(
            emailResult.error.message ?? "Could not change email.",
          );
        }
      }
    } catch (failure) {
      setProfileError(formatRpcError(failure));
    } finally {
      setProfileBusy(false);
    }
  };

  const changePassword = async () => {
    setPasswordBusy(true);
    setPasswordError(undefined);
    try {
      if (newPassword !== confirmPassword) {
        setPasswordError("New passwords do not match.");
        return;
      }
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
      });
      if (result.error) {
        setPasswordError(result.error.message ?? "Could not change password.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (failure) {
      setPasswordError(formatRpcError(failure));
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <ScrollView flex={1}>
      <YStack gap="$4" p="$4" pb="$8">
        <YStack items="center" gap="$3">
          <UserAvatar
            email={user.email}
            image={image.length > 0 ? image : user.image}
            name={name.length > 0 ? name : user.name}
            size={80}
          />
          <Paragraph color="$color10">{user.email}</Paragraph>
        </YStack>

        <YStack gap="$2">
          <H3>Personal info</H3>
          <Input
            autoComplete="name"
            onChangeText={setName}
            placeholder="Name"
            value={name}
          />
          <Input
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Email"
            value={email}
          />
          <Input
            autoCapitalize="none"
            onChangeText={setImage}
            placeholder="Avatar URL"
            value={image}
          />
          {profileError !== undefined ? (
            <Paragraph color="$red10">{profileError}</Paragraph>
          ) : null}
          <Button disabled={profileBusy} onPress={() => void saveProfile()}>
            {profileBusy ? "Saving…" : "Save profile"}
          </Button>
        </YStack>

        <YStack gap="$2">
          <H3>Password</H3>
          <Input
            autoComplete="password"
            onChangeText={setCurrentPassword}
            placeholder="Current password"
            secureTextEntry
            value={currentPassword}
          />
          <Input
            autoComplete="new-password"
            onChangeText={setNewPassword}
            placeholder="New password"
            secureTextEntry
            value={newPassword}
          />
          <Input
            autoComplete="new-password"
            onChangeText={setConfirmPassword}
            placeholder="Confirm new password"
            secureTextEntry
            value={confirmPassword}
          />
          {passwordError !== undefined ? (
            <Paragraph color="$red10">{passwordError}</Paragraph>
          ) : null}
          <Button disabled={passwordBusy} onPress={() => void changePassword()}>
            {passwordBusy ? "Updating…" : "Change password"}
          </Button>
        </YStack>

        <YStack gap="$2">
          <H3>Session</H3>
          <SignOutButton />
        </YStack>

        <Paragraph color="$color10" fontSize={12} pt="$4" text="center">
          {appVersionLabel}
        </Paragraph>
      </YStack>
    </ScrollView>
  );
}

function AiTab() {
  const [summary, setSummary] = useState<UsageSummary | undefined>();
  const [range, setRange] = useState<UsageRange>("30d");
  const [metric, setMetric] = useState<UsageMetric>("spend");
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(undefined);
    void mobileRuntime
      .runPromise(
        Effect.gen(function* () {
          const rpc = yield* RpcHttp;
          return yield* rpc.UsageSummary({ range });
        }),
      )
      .then((next) => {
        setSummary(next);
      })
      .catch((failure: unknown) => {
        setError(formatRpcError(failure));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [range]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && summary === undefined) {
    return (
      <YStack flex={1} items="center" justify="center" gap="$3">
        <Spinner />
        <Paragraph>Loading usage…</Paragraph>
      </YStack>
    );
  }

  return (
    <ScrollView flex={1}>
      <YStack gap="$4" p="$4">
        {error !== undefined ? (
          <YStack gap="$2">
            <Paragraph color="$red10">{error}</Paragraph>
            <Button onPress={load}>Retry</Button>
          </YStack>
        ) : null}
        {summary !== undefined ? (
          <UsageRenderBoundary>
            <AiUsageDashboard
              metric={metric}
              onMetricChange={setMetric}
              onRangeChange={setRange}
              range={range}
              summary={summary}
            />
          </UsageRenderBoundary>
        ) : null}
      </YStack>
    </ScrollView>
  );
}

class UsageRenderBoundary extends Component<
  { readonly children: ReactNode },
  { readonly error?: string }
> {
  state: { readonly error?: string } = {};

  static getDerivedStateFromError(error: Error): { readonly error: string } {
    return { error: error.message };
  }

  render() {
    if (this.state.error !== undefined) {
      return <Paragraph color="$red10">{this.state.error}</Paragraph>;
    }
    return this.props.children;
  }
}
