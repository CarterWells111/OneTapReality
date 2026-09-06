import { getBuildEnvironment } from "../../config/build-environment";

type StyleProperty = "color" | "coverColor" | "fontSize";
type StyleOutcome = "cancel" | "commit" | "no_op";

type LocalDiagnosticPayloads = {
  formal_persistence_failed: { code: "write_failed"; memoryId: string };
  formal_persistence_succeeded: { memoryId: string };
  formal_save_started: { memoryId: string };
  navigation_boundary: { memoryId: string };
  recovery_clear_failed: { code: "clear_failed"; memoryId: string };
  recovery_clear_succeeded: { memoryId: string };
  recovery_discarded: { memoryId: string; reason: "corrupt" | "stale" };
  recovery_restored: { memoryId: string; source: "memory" | "sqlite" };
  recovery_write_failed: { code: "write_failed"; memoryId: string };
  recovery_write_retried: { memoryId: string };
  style_transaction_finalized: {
    elementId?: string;
    outcome: StyleOutcome;
    pageId: string;
    property: StyleProperty;
  };
};

export type LocalDiagnosticEvent = keyof LocalDiagnosticPayloads;

export type LocalDiagnosticSink = {
  info: (event: LocalDiagnosticEvent, payload: Readonly<Record<string, string>>) => void;
  warn: (event: LocalDiagnosticEvent, payload: Readonly<Record<string, string>>) => void;
};

type LocalDiagnostics = {
  emit<Event extends LocalDiagnosticEvent>(
    event: Event,
    payload: LocalDiagnosticPayloads[Event],
  ): void;
};

type DiagnosticEnvironment = {
  environmentId: "staging" | "production";
  isDevelopment: boolean;
};
const INTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/u;
const WARNING_EVENTS = new Set<LocalDiagnosticEvent>([
  "formal_persistence_failed",
  "recovery_clear_failed",
  "recovery_discarded",
  "recovery_write_failed",
]);

function isInternalId(value: unknown): value is string {
  return typeof value === "string" && INTERNAL_ID.test(value);
}

function isOneOf<Value extends string>(value: unknown, values: readonly Value[]): value is Value {
  return typeof value === "string" && values.includes(value as Value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function sanitizePayload(
  event: LocalDiagnosticEvent,
  payload: unknown,
): Record<string, string> | null {
  const candidate = asRecord(payload);
  if (!candidate) return null;
  const memoryId = candidate.memoryId;

  switch (event) {
    case "style_transaction_finalized":
      if (!isInternalId(candidate.pageId)
        || !isOneOf(candidate.property, ["color", "coverColor", "fontSize"])
        || !isOneOf(candidate.outcome, ["cancel", "commit", "no_op"])
        || (candidate.property === "coverColor"
          ? candidate.elementId !== undefined
          : !isInternalId(candidate.elementId))) {
        return null;
      }
      return {
        ...(isInternalId(candidate.elementId) ? { elementId: candidate.elementId } : {}),
        outcome: candidate.outcome,
        pageId: candidate.pageId,
        property: candidate.property,
      };
    case "recovery_restored":
      if (!isInternalId(memoryId) || !isOneOf(candidate.source, ["memory", "sqlite"])) return null;
      return { memoryId, source: candidate.source };
    case "recovery_discarded":
      if (!isInternalId(memoryId) || !isOneOf(candidate.reason, ["corrupt", "stale"])) return null;
      return { memoryId, reason: candidate.reason };
    case "formal_persistence_failed":
    case "recovery_write_failed":
      if (!isInternalId(memoryId) || candidate.code !== "write_failed") return null;
      return { code: "write_failed", memoryId };
    case "recovery_clear_failed":
      if (!isInternalId(memoryId) || candidate.code !== "clear_failed") return null;
      return { code: "clear_failed", memoryId };
    case "formal_persistence_succeeded":
    case "formal_save_started":
    case "navigation_boundary":
    case "recovery_clear_succeeded":
    case "recovery_write_retried":
      return isInternalId(memoryId) ? { memoryId } : null;
  }
}

export function isLocalDiagnosticsEnabled(environment: DiagnosticEnvironment) {
  return environment.isDevelopment || environment.environmentId === "staging";
}

const consoleSink: LocalDiagnosticSink = {
  info: (event, payload) => console.info("[canvas-local-diagnostic]", event, payload),
  warn: (event, payload) => console.warn("[canvas-local-diagnostic]", event, payload),
};

export function createLocalDiagnostics({
  enabled,
  sink = consoleSink,
}: {
  enabled: boolean;
  sink?: LocalDiagnosticSink;
}): LocalDiagnostics {
  return {
    emit(event, payload) {
      if (!enabled) return;
      try {
        const safePayload = sanitizePayload(event, payload);
        if (!safePayload) return;
        const level = WARNING_EVENTS.has(event) ? "warn" : "info";
        sink[level](event, Object.freeze(safePayload));
      } catch {
        // Diagnostics must never alter editor, recovery, save, or navigation behavior.
      }
    },
  };
}

const isDevelopmentBuild = typeof __DEV__ !== "undefined" && __DEV__;
const isClientRuntime = typeof window !== "undefined";

export const localDiagnostics = createLocalDiagnostics({
  enabled: process.env.NODE_ENV !== "test" && isClientRuntime && isLocalDiagnosticsEnabled({
    environmentId: getBuildEnvironment().environmentId,
    isDevelopment: isDevelopmentBuild,
  }),
});
