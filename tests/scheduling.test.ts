import { describe, expect, test } from "bun:test";
import { parseScheduleTimeZone, scheduleTimestampForInput, scheduleTimestampForStorage } from "../src/core/scheduling";

describe("scheduled publishing timezones", () => {
  test("converts configured local time to UTC and back", () => {
    const stored = scheduleTimestampForStorage("2026-07-24T12:30", "Asia/Tokyo");
    expect(stored).toBe("2026-07-24T03:30:00.000Z");
    expect(scheduleTimestampForInput(stored, "Asia/Tokyo")).toBe("2026-07-24T12:30");
  });

  test("preserves API timestamps that include an explicit offset", () => {
    expect(scheduleTimestampForStorage("2026-07-24T12:30:00+09:00", "UTC")).toBe("2026-07-24T03:30:00.000Z");
  });

  test("rejects nonexistent daylight-saving local times", () => {
    expect(() => scheduleTimestampForStorage("2026-03-08T02:30", "America/New_York")).toThrow();
  });

  test("uses UTC when the configured timezone is invalid", () => {
    expect(parseScheduleTimeZone("Not/A_Timezone")).toBe("UTC");
  });
});
