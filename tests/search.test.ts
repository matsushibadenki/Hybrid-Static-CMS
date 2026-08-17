import { describe, expect, test } from "bun:test";
import { buildSearchCondition, normalizeSearchQuery } from "../src/core/search";

describe("multilingual search", () => {
  test("normalizes full-width characters, case, controls, and whitespace", () => {
    expect(normalizeSearchQuery("  ＡＢＣ\u0000　東京  ")).toEqual({
      query: "abc 東京",
      tokens: ["abc", "東京"],
    });
  });

  test("limits the query and number of search terms", () => {
    const result = normalizeSearchQuery("一 二 三 四 五 六 七 八 九 十".repeat(30));
    expect(result.query.length).toBeLessThanOrEqual(200);
    expect(result.tokens).toHaveLength(8);
  });

  test("escapes SQL LIKE wildcards while keeping values parameterized", () => {
    const params: Array<string | number> = [];
    const built = buildSearchCondition("p", "100%_完了", params);
    expect(built?.condition).toContain("p.search_text like $1");
    expect(params).toEqual(["%100\\%\\_完了%", "100%_完了"]);
  });

  test("rejects unsafe SQL aliases", () => {
    expect(() => buildSearchCondition("p; drop table posts", "test", [])).toThrow();
  });
});
