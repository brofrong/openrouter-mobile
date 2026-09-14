import { Platform } from "react-native";

const pickImageWeb = (): Promise<string | undefined> =>
  new Promise((resolve) => {
    const input = document.createElement("input");
    input.accept = "image/*";
    input.type = "file";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file === undefined) {
        resolve(undefined);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        resolve(typeof reader.result === "string" ? reader.result : undefined);
      };
      reader.onerror = () => {
        resolve(undefined);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });

export const pickImageDataUrl = async (): Promise<string | undefined> => {
  if (Platform.OS === "web") {
    return pickImageWeb();
  }
  const ImagePicker = await import("expo-image-picker");
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return undefined;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    base64: true,
    mediaTypes: ["images"],
    quality: 0.8,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (asset?.base64 === undefined) {
    return undefined;
  }
  const mime = asset.mimeType ?? "image/jpeg";
  return `data:${mime};base64,${asset.base64}`;
};
