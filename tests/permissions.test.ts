import { describe, expect, test } from "bun:test";
import { hasPermission } from "../src/core/permissions";

describe("permissions", () => {
  test("authors can edit but not publish or delete posts", () => {
    const author = { roles: ["author"] as const };
    expect(hasPermission(author, "posts.write")).toBe(true);
    expect(hasPermission(author, "posts.publish")).toBe(false);
    expect(hasPermission(author, "posts.delete")).toBe(false);
  });

  test("viewers are read-only", () => {
    const viewer = { roles: ["viewer"] as const };
    expect(hasPermission(viewer, "posts.read")).toBe(true);
    expect(hasPermission(viewer, "posts.write")).toBe(false);
    expect(hasPermission(viewer, "users.manage")).toBe(false);
  });

  test("AI agents can submit proposals but cannot review them", () => {
    const agent = { roles: ["ai_agent"] as const };
    expect(hasPermission(agent, "ai.propose")).toBe(true);
    expect(hasPermission(agent, "ai.review")).toBe(false);
  });
});
