import { describe, expect, test } from "bun:test";
import { AppValidationError, validateScheduledState, validateSlug } from "../src/core/validation";

describe("validation", () => {
  test("accepts safe slugs", () => {
    expect(() => validateSlug("news-2026")).not.toThrow();
  });

  test("rejects unsafe slugs", () => {
    expect(() => validateSlug("News title")).toThrow(AppValidationError);
    expect(() => validateSlug("news/title")).toThrow(AppValidationError);
  });

  test("requires a date for scheduled content", () => {
    expect(() => validateScheduledState("scheduled", "")).toThrow(AppValidationError);
    expect(() => validateScheduledState("draft", "")).not.toThrow();
  });
});
