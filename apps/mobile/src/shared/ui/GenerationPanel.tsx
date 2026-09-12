import type { GenerationJob, JobEvent } from "@openrouter-mobile/domain";
import { Effect } from "effect";
import { useCallback, useState } from "react";
import { Button, H2, Input, Paragraph, Text, YStack } from "tamagui";
import { withAfterSeq } from "../afterSeq";
import { formatRpcError } from "../errors";
import { RpcHttp, RpcWs } from "../rpc";
import { mobileRuntime } from "../runtime";
import { useRpcStream } from "../use-rpc-stream";

type GenerationKind = "image" | "video" | "speech" | "audio";

type GenerationPanelProps = {
  readonly title: string;
  readonly description: string;
  readonly inputLabel: string;
  readonly submitLabel: string;
  readonly kind: GenerationKind;
};

const startJob = (kind: GenerationKind, input: string) =>
  Effect.gen(function* () {
    const rpc = yield* RpcHttp;
    switch (kind) {
      case "image":
        return yield* rpc.ImageGenerate({ prompt: input });
      case "video":
        return yield* rpc.VideoGenerate({ prompt: input });
      case "speech":
        return yield* rpc.SpeechSynthesize({ text: input });
      case "audio":
        return yield* rpc.AudioTranscribe({ assetId: input });
    }
  });

export function GenerationPanel({
  title,
  description,
  inputLabel,
  submitLabel,
  kind,
}: GenerationPanelProps) {
  const [input, setInput] = useState("");
  const [job, setJob] = useState<GenerationJob | undefined>();
  const [event, setEvent] = useState<JobEvent | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const submit = () => {
    const value = input.trim();
    if (value.length === 0) {
      setError(`${inputLabel} is required.`);
      return;
    }
    setBusy(true);
    setError(undefined);
    setEvent(undefined);
    void mobileRuntime.runPromise(
      startJob(kind, value).pipe(
        Effect.match({
          onFailure: (failure) => {
            setError(formatRpcError(failure));
            setBusy(false);
          },
          onSuccess: (created) => {
            setJob(created);
            setBusy(false);
          },
        }),
      ),
    );
  };

  const subscribeMake = useCallback(
    (afterSeq?: number) =>
      Effect.gen(function* () {
        if (job === undefined) {
          return yield* Effect.die("Job stream started without a job");
        }
        const rpc = yield* RpcWs;
        return rpc.JobSubscribe(withAfterSeq({ jobId: job.id }, afterSeq));
      }),
    [job],
  );

  const onJobEvent = useCallback((next: JobEvent) => {
    setEvent(next);
    if (next.status === "completed" || next.status === "failed") {
      setBusy(false);
    }
  }, []);

  const onStreamError = useCallback((message: string) => {
    setError(message);
    setBusy(false);
  }, []);

  useRpcStream({
    enabled: job !== undefined,
    key: job?.id ?? "",
    make: subscribeMake,
    onChunk: onJobEvent,
    onError: onStreamError,
  });

  const status = event?.status ?? job?.status;
  const resultUrl = event?.url ?? job?.resultUrl;
  const jobError = event?.error ?? job?.error;

  return (
    <YStack flex={1} p="$4" gap="$3" bg="$background">
      <H2>{title}</H2>
      <Paragraph>{description}</Paragraph>
      <Input
        placeholder={inputLabel}
        value={input}
        onChangeText={setInput}
        onSubmitEditing={submit}
      />
      <Button disabled={busy} onPress={submit}>
        {busy ? "Working…" : submitLabel}
      </Button>
      {error !== undefined ? (
        <Paragraph color="$red10">{error}</Paragraph>
      ) : null}
      {status !== undefined ? (
        <Paragraph>Status: {status}</Paragraph>
      ) : (
        <Paragraph color="$color10">No job yet.</Paragraph>
      )}
      {jobError !== undefined ? (
        <Paragraph color="$red10">{jobError}</Paragraph>
      ) : null}
      {resultUrl !== undefined ? <Text>Result: {resultUrl}</Text> : null}
    </YStack>
  );
}
