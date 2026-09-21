import { StoredChatFile } from "@openrouter-mobile/domain";
import { Platform } from "react-native";
import { type NativeUploadFile, uploadMediaFile } from "../upload-media";

const FILE_ACCEPT =
  "image/*,.xlsx,.docx,.pptx,.pdf,.csv,.txt,.md,.markdown,application/pdf,text/csv,text/plain,text/markdown";

const pickFileWeb = (): Promise<File | undefined> =>
  new Promise((resolve) => {
    const input = document.createElement("input");
    input.accept = FILE_ACCEPT;
    input.type = "file";
    input.onchange = () => {
      resolve(input.files?.[0] ?? undefined);
    };
    input.click();
  });

const pickFileNative = async (): Promise<
  (NativeUploadFile & { readonly size: number }) | undefined
> => {
  const DocumentPicker = await import("expo-document-picker");
  const result = await DocumentPicker.getDocumentAsync({
    copyToCacheDirectory: true,
    type: "*/*",
  });
  if (result.canceled) {
    return undefined;
  }
  const asset = result.assets[0];
  if (asset?.uri === undefined) {
    return undefined;
  }
  return {
    uri: asset.uri,
    name: asset.name ?? "file",
    type: asset.mimeType ?? "application/octet-stream",
    size: asset.size ?? 0,
  };
};

export const pickAndUploadChatFile = async (): Promise<
  StoredChatFile | undefined
> => {
  if (Platform.OS === "web") {
    const file = await pickFileWeb();
    if (file === undefined) {
      return undefined;
    }
    const url = await uploadMediaFile(file);
    if (url === undefined) {
      return undefined;
    }
    return new StoredChatFile({
      url,
      name: file.name,
      mime: file.type.length > 0 ? file.type : "application/octet-stream",
      size: file.size,
    });
  }
  const file = await pickFileNative();
  if (file === undefined) {
    return undefined;
  }
  const url = await uploadMediaFile(file);
  if (url === undefined) {
    return undefined;
  }
  return new StoredChatFile({
    url,
    name: file.name,
    mime: file.type,
    size: file.size,
  });
};
