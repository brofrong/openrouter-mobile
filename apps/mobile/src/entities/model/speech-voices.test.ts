import { expect, test } from "bun:test";
import { speechVoiceLabel } from "./speech-voices";

test("speechVoiceLabel turns provider ids into short labels", () => {
  expect(speechVoiceLabel("en_paul_neutral")).toBe("Paul Neutral");
  expect(speechVoiceLabel("gb_jane_sarcasm")).toBe("Jane Sarcasm");
  expect(speechVoiceLabel("eve")).toBe("Eve");
  expect(speechVoiceLabel("Kore")).toBe("Kore");
  expect(speechVoiceLabel("en-US-Harper:MAI-Voice-2")).toBe("Harper");
  expect(speechVoiceLabel("English_expressive_narrator")).toBe(
    "Expressive Narrator",
  );
  expect(speechVoiceLabel("aura-2-thalia-en")).toBe("Thalia");
});
