import { describe, expect, test } from "bun:test";
import { parseCommandArguments, parseConfigNumber, parseLogLevel, parseMailDeliveryMode, parsePublicLocale, parseRoleByteLimits, parseRoleSet } from "../src/core/config";

describe("configuration parsing", () => {
  test("falls back for non-numeric values and clamps unsafe ranges", () => {
    expect(parseConfigNumber("not-a-number", 10, { min: 1 })).toBe(10);
    expect(parseConfigNumber("0", 10, { min: 1 })).toBe(1);
    expect(parseConfigNumber("70000", 3000, { max: 65_535 })).toBe(65_535);
  });

  test("preserves finite decimal values when requested", () => {
    expect(parseConfigNumber("0.7", 0.5, { min: 0, max: 1, integer: false })).toBe(0.7);
  });

  test("accepts supported log levels and uses a safe fallback", () => {
    expect(parseLogLevel("debug")).toBe("debug");
    expect(parseLogLevel("error")).toBe("error");
    expect(parseLogLevel("verbose")).toBe("info");
    expect(parseLogLevel(undefined, "error")).toBe("error");
  });

  test("accepts supported mail delivery modes and safe process arguments", () => {
    expect(parseMailDeliveryMode("sendmail")).toBe("sendmail");
    expect(parseMailDeliveryMode("http")).toBe("http");
    expect(parseMailDeliveryMode("unknown")).toBe("smtp");
    expect(parseCommandArguments("-i -f", ["-i"])).toEqual(["-i", "-f"]);
  });

  test("parses upload roles and ignores unknown values", () => {
    expect(Array.from(parseRoleSet("owner, author,unknown"))).toEqual(["owner", "author"]);
    expect(Array.from(parseRoleSet(undefined, ["editor"]))).toEqual(["editor"]);
  });

  test("parses byte limits from comma or pipe separated role entries", () => {
    expect(parseRoleByteLimits("owner:0,author:5242880|editor:10485760,viewer:-1,unknown:10")).toEqual({
      owner: 0,
      author: 5_242_880,
      editor: 10_485_760,
    });
  });
});

describe("public locale configuration", () => {
  test("accepts supported locales and falls back to English", () => {
    expect(parsePublicLocale("ja")).toBe("ja");
    expect(parsePublicLocale("zh")).toBe("zh");
    expect(parsePublicLocale("fr")).toBe("en");
  });
});
