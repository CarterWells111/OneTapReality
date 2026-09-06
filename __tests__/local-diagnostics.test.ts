import {
  createLocalDiagnostics,
  isLocalDiagnosticsEnabled,
  type LocalDiagnosticSink,
} from "../src/features/diagnostics/local-diagnostics";

describe("local canvas recovery diagnostics", () => {
  it("enables development and staging diagnostics but disables production", () => {
    expect(isLocalDiagnosticsEnabled({
      environmentId: "production",
      isDevelopment: true,
    })).toBe(true);
    expect(isLocalDiagnosticsEnabled({
      environmentId: "staging",
      isDevelopment: false,
    })).toBe(true);
    expect(isLocalDiagnosticsEnabled({
      environmentId: "production",
      isDevelopment: false,
    })).toBe(false);
  });

  it("emits only the allowlisted scalar payload and strips sensitive or unknown fields", () => {
    const info = jest.fn();
    const warn = jest.fn();
    const diagnostics = createLocalDiagnostics({
      enabled: true,
      sink: { info, warn },
    });

    diagnostics.emit("style_transaction_finalized", {
      elementId: "page-1:headline",
      outcome: "commit",
      pageId: "page-1",
      property: "color",
      email: "owner@example.com",
      photoUri: "file:///private/photo.jpg",
      text: "private caption",
      token: "secret-token",
    } as never);

    expect(info).toHaveBeenCalledWith("style_transaction_finalized", {
      elementId: "page-1:headline",
      outcome: "commit",
      pageId: "page-1",
      property: "color",
    });
    expect(warn).not.toHaveBeenCalled();
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/owner@example|private|secret-token/u);
  });

  it("does not call a sink while disabled and swallows sink failures", () => {
    const disabledSink: LocalDiagnosticSink = {
      info: jest.fn(),
      warn: jest.fn(),
    };
    const disabled = createLocalDiagnostics({ enabled: false, sink: disabledSink });
    disabled.emit("formal_save_started", { memoryId: "memory-1" });
    expect(disabledSink.info).not.toHaveBeenCalled();

    const failing = createLocalDiagnostics({
      enabled: true,
      sink: {
        info: () => { throw new Error("sink failed with private data"); },
        warn: () => { throw new Error("sink failed with private data"); },
      },
    });
    expect(() => failing.emit("formal_save_started", { memoryId: "memory-1" })).not.toThrow();
    expect(() => failing.emit("formal_persistence_failed", {
      code: "write_failed",
      memoryId: "memory-1",
    })).not.toThrow();
  });

  it("rejects invalid enum values and unsafe identifiers without throwing", () => {
    const sink: LocalDiagnosticSink = { info: jest.fn(), warn: jest.fn() };
    const diagnostics = createLocalDiagnostics({ enabled: true, sink });

    expect(() => diagnostics.emit("recovery_discarded", {
      memoryId: "user supplied sentence with spaces",
      reason: "corrupt",
    })).not.toThrow();
    diagnostics.emit("style_transaction_finalized", {
      elementId: "element-1",
      outcome: "unexpected",
      pageId: "page-1",
      property: "color",
    } as never);

    expect(sink.info).not.toHaveBeenCalled();
    expect(sink.warn).not.toHaveBeenCalled();
  });

  it("keeps sensitive and free-form fields out of the typed payload contract", () => {
    const diagnostics = createLocalDiagnostics({ enabled: false });
    if (false) {
      // @ts-expect-error User text is not part of any diagnostic payload.
      diagnostics.emit("formal_save_started", { memoryId: "memory-1", text: "private" });
      diagnostics.emit("recovery_restored", {
        // @ts-expect-error Account isolation keys are forbidden from recovery diagnostics.
        accountKey: "owner@example.com",
        memoryId: "memory-1",
        source: "sqlite",
      });
    }
    expect(diagnostics).toBeDefined();
  });
});
