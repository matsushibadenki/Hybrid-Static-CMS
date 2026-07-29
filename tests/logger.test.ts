import { describe, expect, test } from "bun:test";
import { createLogRecord, logLevelEnabled, sanitizeLogContext } from "../src/core/logger";

describe("structured application logging", () => {
  test("redacts credentials and authentication material recursively", () => {
    const circular: Record<string, unknown> = {
      password: "plain-text",
      nested: {
        csrfToken: "csrf-value",
        authorization: "Bearer abc123",
        database: "postgres://cms:private-password@db.example/cms",
        url: "https://example.test/hook?token=visible&item=1",
      },
    };
    circular.circular = circular;

    expect(sanitizeLogContext(circular)).toEqual({
      password: "[REDACTED]",
      nested: {
        csrfToken: "[REDACTED]",
        authorization: "[REDACTED]",
        database: "postgres://cms:[REDACTED]@db.example/cms",
        url: "https://example.test/hook?token=[REDACTED]&item=1",
      },
      circular: "[CIRCULAR]",
    });
  });

  test("emits stable machine-readable records", () => {
    const record = createLogRecord(
      "error",
      "http.unhandled_error",
      "Request failed",
      { error: new Error("Bearer private-token") },
      new Date("2026-07-29T00:00:00.000Z"),
    );
    expect(record.timestamp).toBe("2026-07-29T00:00:00.000Z");
    expect(record.level).toBe("error");
    expect(record.event).toBe("http.unhandled_error");
    expect(JSON.stringify(record)).not.toContain("private-token");
  });

  test("filters messages below the configured severity", () => {
    expect(logLevelEnabled("debug", "info")).toBe(false);
    expect(logLevelEnabled("warn", "info")).toBe(true);
    expect(logLevelEnabled("error", "error")).toBe(true);
  });
});
