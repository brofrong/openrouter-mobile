import { Platform } from "react-native";
import { type NativeUploadFile, uploadMediaFile } from "../upload-media";

const pickImageWeb = (): Promise<File | undefined> =>
  new Promise((resolve) => {
    const input = document.createElement("input");
    input.accept = "image/*";
    input.type = "file";
    input.onchange = () => {
      resolve(input.files?.[0] ?? undefined);
    };
    input.click();
  });

const pickImageNative = async (): Promise<NativeUploadFile | undefined> => {
  const ImagePicker = await import("expo-image-picker");
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return undefined;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (asset?.uri === undefined) {
    return undefined;
  }
  return {
    uri: asset.uri,
    name: asset.fileName ?? "image.jpg",
    type: asset.mimeType ?? "image/jpeg",
  };
};

export const pickAndUploadImage = async (): Promise<string | undefined> => {
  const file =
    Platform.OS === "web" ? await pickImageWeb() : await pickImageNative();
  if (file === undefined) {
    return undefined;
  }
  return uploadMediaFile(file);
};
