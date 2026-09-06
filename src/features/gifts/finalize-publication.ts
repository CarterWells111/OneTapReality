import { BackendApiError } from "../../services/backend/api-client";

type FinalizeResponse = { albumId: string; version?: number };

export type FinalizePublicationResult =
  | ({ status: "success" } & FinalizeResponse)
  | { status: "retryable"; publicationId: string };

type RetryDelay = (milliseconds: number, signal: AbortSignal) => Promise<void>;

function abortError(): Error {
  const error = new Error("Publication finalization was aborted");
  error.name = "AbortError";
  return error;
}

const waitForRetry: RetryDelay = (milliseconds, signal) => new Promise<void>((resolve, reject) => {
  if (signal.aborted) {
    reject(abortError());
    return;
  }
  const timeout = setTimeout(() => {
    signal.removeEventListener("abort", abort);
    resolve();
  }, milliseconds);
  const abort = () => {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    reject(abortError());
  };
  signal.addEventListener("abort", abort, { once: true });
});

function isRetryableFinalizationError(error: unknown): boolean {
  return error instanceof BackendApiError
    ? error.code === "gift_publication_retryable" || error.status === 0
    : error instanceof TypeError;
}

export async function finalizePublicationWithRetry(input: {
  publicationId: string;
  finalize: (publicationId: string) => Promise<FinalizeResponse>;
  signal?: AbortSignal;
  delay?: RetryDelay;
}): Promise<FinalizePublicationResult> {
  const controller = input.signal ? null : new AbortController();
  const signal = input.signal ?? controller!.signal;
  const delay = input.delay ?? waitForRetry;
  const retryDelays = [500, 1_500] as const;

  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    if (signal.aborted) throw abortError();
    try {
      const response = await input.finalize(input.publicationId);
      return { status: "success", ...response };
    } catch (error) {
      if (signal.aborted) throw abortError();
      if (!isRetryableFinalizationError(error)) throw error;
      if (attempt >= retryDelays.length) return { status: "retryable", publicationId: input.publicationId };
      await delay(retryDelays[attempt], signal);
    }
  }

  return { status: "retryable", publicationId: input.publicationId };
}
