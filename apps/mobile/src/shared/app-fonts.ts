import { useFonts } from "expo-font";
import { useEffect } from "react";
import { Platform } from "react-native";

export const APP_SANS = "Golos Text";

export const APP_SANS_NATIVE = {
  regular: "GolosText-Regular",
  medium: "GolosText-Medium",
  semiBold: "GolosText-SemiBold",
  bold: "GolosText-Bold",
} as const;

const regular = require("../../assets/fonts/GolosText-Regular.ttf") as
  | string
  | number;
const medium = require("../../assets/fonts/GolosText-Medium.ttf") as
  | string
  | number;
const semiBold = require("../../assets/fonts/GolosText-SemiBold.ttf") as
  | string
  | number;
const bold = require("../../assets/fonts/GolosText-Bold.ttf") as
  | string
  | number;

const injectWebFontFaces = () => {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return;
  }
  if (document.getElementById("app-font-faces") !== null) {
    return;
  }
  const style = document.createElement("style");
  style.id = "app-font-faces";
  style.textContent = (
    [
      ["400", regular],
      ["500", medium],
      ["600", semiBold],
      ["700", bold],
    ] as const
  )
    .map(
      ([weight, src]) =>
        `@font-face{font-family:'${APP_SANS}';src:url(${JSON.stringify(String(src))}) format('truetype');font-weight:${weight};font-style:normal;font-display:swap;}`,
    )
    .join("");
  style.textContent += `html,body,#root{font-family:'${APP_SANS}',-apple-system,system-ui,sans-serif;}`;
  document.head.appendChild(style);
};

injectWebFontFaces();

export function useAppFonts(): boolean {
  useEffect(() => {
    injectWebFontFaces();
  }, []);

  const [loaded, error] = useFonts({
    [APP_SANS_NATIVE.regular]: regular,
    [APP_SANS_NATIVE.medium]: medium,
    [APP_SANS_NATIVE.semiBold]: semiBold,
    [APP_SANS_NATIVE.bold]: bold,
  });

  if (Platform.OS === "web") {
    return true;
  }
  return loaded || error !== null;
}
