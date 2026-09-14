import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router/js-tabs";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { UserAvatarButton } from "../../features/profile/UserAvatarButton";

type IconName = ComponentProps<typeof Ionicons>["name"];

const tabIcon =
  (focusedName: IconName, outlineName: IconName) =>
  ({
    color,
    size,
    focused,
  }: {
    color: ColorValue;
    size: number;
    focused: boolean;
  }) => (
    <Ionicons
      color={color}
      name={focused ? focusedName : outlineName}
      size={size}
    />
  );

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerTitleAlign: "center",
        headerRight: () => <UserAvatarButton />,
      }}
    >
      <Tabs.Screen
        name="(chat)"
        options={{
          title: "Chat",
          tabBarIcon: tabIcon("chatbubbles", "chatbubbles-outline"),
        }}
      />
      <Tabs.Screen
        name="images"
        options={{
          title: "Images",
          tabBarIcon: tabIcon("image", "image-outline"),
        }}
      />
      <Tabs.Screen
        name="video"
        options={{
          title: "Video",
          tabBarIcon: tabIcon("videocam", "videocam-outline"),
        }}
      />
      <Tabs.Screen
        name="speech"
        options={{
          title: "Speech",
          tabBarIcon: tabIcon("mic", "mic-outline"),
        }}
      />
      <Tabs.Screen
        name="audio"
        options={{
          title: "Audio",
          tabBarIcon: tabIcon("musical-notes", "musical-notes-outline"),
        }}
      />
    </Tabs>
  );
}
