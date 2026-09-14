import { expect, test } from "bun:test";
import {
  AUDIO_MODELS,
  DEFAULT_AUDIO_MODEL_ID,
  DEFAULT_SPEECH_MODEL_ID,
  DEFAULT_VIDEO_MODEL_ID,
  resolveAudioModel,
  resolveMediaModel,
  resolveSpeechModel,
  resolveSpeechOptions,
  resolveVideoModel,
  resolveVideoOptions,
  SPEECH_MODELS,
  speechModelFromPicker,
  speechModelHasOptions,
  VIDEO_MODELS,
  videoModelFromPicker,
  videoModelHasOptions,
} from "./media-catalog";

test("resolveVideoModel returns the catalog entry for a known id", () => {
  const model = resolveVideoModel("google/veo-3.1");
  expect(model.id).toBe("google/veo-3.1");
  expect(model.company).toBe("Google");
  expect(model.name).toBe("Veo 3.1");
});

test("resolveVideoModel keeps a stored id that is not in the local catalog", () => {
  const model = resolveVideoModel("unknown-lab/clip-1");
  expect(model.id).toBe("unknown-lab/clip-1");
  expect(model.company).toBe("unknown-lab");
  expect(model.name).toBe("clip-1");
  expect(resolveVideoModel(undefined).id).toBe(DEFAULT_VIDEO_MODEL_ID);
  expect(resolveVideoModel("").id).toBe(DEFAULT_VIDEO_MODEL_ID);
});

test("videoModelFromPicker keeps OpenRouter identity and curated options", () => {
  const unknown = videoModelFromPicker({
    id: "unknown-lab/clip-1",
    company: "Unknown Lab",
    name: "Clip 1",
    iconColor: "#123456",
  });
  expect(unknown).toEqual({
    id: "unknown-lab/clip-1",
    company: "Unknown Lab",
    name: "Clip 1",
    iconColor: "#123456",
  });
  expect(videoModelHasOptions(unknown)).toBe(false);

  const veo = videoModelFromPicker({
    id: "google/veo-3.1",
    company: "Google",
    name: "Veo 3.1",
    iconColor: "#4285F4",
  });
  expect(veo.resolutions).toEqual(["720p", "1080p", "4K"]);
});

test("resolveSpeechModel falls back to the default model", () => {
  expect(resolveSpeechModel("unknown/not-real").id).toBe(
    DEFAULT_SPEECH_MODEL_ID,
  );
  expect(resolveSpeechModel(undefined).id).toBe(DEFAULT_SPEECH_MODEL_ID);
});

test("resolveAudioModel keeps a stored id that is not in the local catalog", () => {
  const model = resolveAudioModel("unknown-lab/song-1");
  expect(model.id).toBe("unknown-lab/song-1");
  expect(model.company).toBe("unknown-lab");
  expect(model.name).toBe("song-1");
  expect(resolveAudioModel(undefined).id).toBe(DEFAULT_AUDIO_MODEL_ID);
  expect(resolveAudioModel("").id).toBe(DEFAULT_AUDIO_MODEL_ID);
});

test("resolveSpeechModel includes a default voice for known TTS models", () => {
  expect(resolveSpeechModel(DEFAULT_SPEECH_MODEL_ID).defaultVoice).toBe(
    "en_paul_neutral",
  );
  expect(resolveSpeechModel("x-ai/grok-voice-tts-1.0").defaultVoice).toBe(
    "eve",
  );
});

test("speechModelFromPicker keeps OpenRouter identity and curated voices", () => {
  const unknown = speechModelFromPicker({
    id: "unknown-lab/speak-1",
    company: "Unknown Lab",
    name: "Speak 1",
    iconColor: "#123456",
  });
  expect(unknown).toEqual({
    id: "unknown-lab/speak-1",
    company: "Unknown Lab",
    name: "Speak 1",
    iconColor: "#123456",
  });
  expect(speechModelHasOptions(unknown)).toBe(false);

  const grok = speechModelFromPicker({
    id: "x-ai/grok-voice-tts-1.0",
    company: "xAI",
    name: "Grok Voice TTS",
    iconColor: "#111111",
  });
  expect(grok.voices).toEqual(["eve", "ara", "rex", "sal", "leo"]);
  expect(speechModelHasOptions(grok)).toBe(true);
  expect(speechModelHasOptions(resolveSpeechModel("fish-audio/s2.1-pro"))).toBe(
    false,
  );
});

test("resolveSpeechOptions keeps a supported voice and replaces ones the next model cannot use", () => {
  const voxtral = resolveSpeechModel(DEFAULT_SPEECH_MODEL_ID);
  const grok = resolveSpeechModel("x-ai/grok-voice-tts-1.0");

  expect(resolveSpeechOptions(voxtral, { voice: "gb_jane_sarcasm" })).toEqual({
    voice: "gb_jane_sarcasm",
  });
  expect(resolveSpeechOptions(grok, { voice: "gb_jane_sarcasm" })).toEqual({
    voice: "eve",
  });
  expect(resolveSpeechOptions(grok, { voice: "leo" })).toEqual({
    voice: "leo",
  });
});

test("videoModelHasOptions is true for catalog models with aspect, duration, or audio", () => {
  expect(videoModelHasOptions(resolveVideoModel(DEFAULT_VIDEO_MODEL_ID))).toBe(
    true,
  );
  expect(videoModelHasOptions(resolveVideoModel("google/veo-3.1"))).toBe(true);
  expect(
    videoModelHasOptions(resolveVideoModel("x-ai/grok-imagine-video")),
  ).toBe(true);
});

test("resolveVideoOptions keeps supported values and replaces ones the next model cannot use", () => {
  const seedance = resolveVideoModel(DEFAULT_VIDEO_MODEL_ID);
  const veo = resolveVideoModel("google/veo-3.1");
  const grok = resolveVideoModel("x-ai/grok-imagine-video");

  expect(
    resolveVideoOptions(seedance, {
      aspectRatio: "21:9",
      resolution: "480p",
      duration: 12,
      generateAudio: false,
    }),
  ).toEqual({
    aspectRatio: "21:9",
    resolution: "480p",
    duration: 12,
    generateAudio: false,
  });

  expect(
    resolveVideoOptions(veo, {
      aspectRatio: "21:9",
      resolution: "4K",
      duration: 12,
      generateAudio: false,
    }),
  ).toEqual({
    aspectRatio: "16:9",
    resolution: "4K",
    duration: 8,
    generateAudio: false,
  });

  expect(resolveVideoOptions(grok, { generateAudio: false })).toEqual({
    aspectRatio: "16:9",
    resolution: "720p",
    duration: 8,
  });
});

test("resolveMediaModel picks the catalog for the media kind", () => {
  expect(resolveMediaModel("video", VIDEO_MODELS[1]?.id).id).toBe(
    "bytedance/seedance-2.5",
  );
  expect(resolveMediaModel("speech", SPEECH_MODELS[1]?.id).company).toBe(
    "Google",
  );
  expect(resolveMediaModel("audio", AUDIO_MODELS[1]?.id).name).toBe(
    "Lyria 3 Pro",
  );
});
