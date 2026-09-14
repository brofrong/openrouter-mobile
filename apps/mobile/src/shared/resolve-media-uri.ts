import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import {
  type MediaKind,
  mediaCacheFileName,
  parseMediaSource,
} from "./media-source";

export const resolvePlayableMediaUri = async (
  url: string,
  kind: MediaKind,
): Promise<string> => {
  const parsed = parseMediaSource(url, kind);
  if (parsed === undefined) {
    throw new Error("Unsupported media URL");
  }
  if (parsed.kind === "remote" || Platform.OS === "web") {
    return parsed.kind === "data" ? url : parsed.uri;
  }

  const directory = new Directory(Paths.cache, `openrouter-${kind}`);
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, mediaCacheFileName(url, parsed.extension));
  if (file.exists) {
    return file.uri;
  }

  file.create();
  try {
    file.write(parsed.base64, { encoding: "base64" });
  } catch (error) {
    if (file.exists) {
      file.delete();
    }
    throw error;
  }
  return file.uri;
};
