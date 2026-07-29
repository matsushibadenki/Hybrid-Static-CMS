import { describe, expect, test } from "bun:test";
import { bigintArray } from "../src/core/db";

describe("database parameters", () => {
  test("binds identifier arrays as PostgreSQL int8 values", () => {
    const parameter = bigintArray([1, 2]) as unknown as { type: number; value: number[] };
    expect(parameter.type).toBe(20);
    expect(parameter.value).toEqual([1, 2]);
  });
});
