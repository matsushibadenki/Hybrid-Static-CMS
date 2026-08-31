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

  test("limits permalink changes to owners and administrators", () => {
    expect(hasPermission({ roles: ["owner"] }, "settings.manage")).toBe(true);
    expect(hasPermission({ roles: ["admin"] }, "settings.manage")).toBe(true);
    expect(hasPermission({ roles: ["editor"] }, "settings.manage")).toBe(false);
  });

  test("limits API key management to owners and administrators", () => {
    expect(hasPermission({ roles: ["owner"] }, "api_keys.manage")).toBe(true);
    expect(hasPermission({ roles: ["admin"] }, "api_keys.manage")).toBe(true);
    expect(hasPermission({ roles: ["editor"] }, "api_keys.manage")).toBe(false);
    expect(hasPermission({ roles: ["author"] }, "api_keys.manage")).toBe(false);
  });

  test("limits database maintenance to owners and administrators", () => {
    expect(hasPermission({ roles: ["owner"] }, "database.manage")).toBe(true);
    expect(hasPermission({ roles: ["admin"] }, "database.manage")).toBe(true);
    expect(hasPermission({ roles: ["editor"] }, "database.manage")).toBe(false);
  });

  test("limits operational metrics to owners and administrators", () => {
    expect(hasPermission({ roles: ["owner"] }, "metrics.read")).toBe(true);
    expect(hasPermission({ roles: ["admin"] }, "metrics.read")).toBe(true);
    expect(hasPermission({ roles: ["editor"] }, "metrics.read")).toBe(false);
  });

  test("allows editors to moderate comments without granting access to viewers", () => {
    expect(hasPermission({ roles: ["editor"] }, "comments.manage")).toBe(true);
    expect(hasPermission({ roles: ["viewer"] }, "comments.read")).toBe(false);
    expect(hasPermission({ roles: ["author"] }, "comments.manage")).toBe(false);
  });

  test("allows editors to approve content while authors can only submit it", () => {
    expect(hasPermission({ roles: ["editor"] }, "posts.review")).toBe(true);
    expect(hasPermission({ roles: ["editor"] }, "pages.review")).toBe(true);
    expect(hasPermission({ roles: ["author"] }, "posts.write")).toBe(true);
    expect(hasPermission({ roles: ["author"] }, "posts.review")).toBe(false);
    expect(hasPermission({ roles: ["viewer"] }, "pages.review")).toBe(false);
  });

  test("allows editors to manage maps while reserving deletion for administrators", () => {
    expect(hasPermission({ roles: ["editor"] }, "maps.read")).toBe(true);
    expect(hasPermission({ roles: ["editor"] }, "maps.write")).toBe(true);
    expect(hasPermission({ roles: ["editor"] }, "maps.delete")).toBe(false);
    expect(hasPermission({ roles: ["viewer"] }, "maps.read")).toBe(true);
    expect(hasPermission({ roles: ["viewer"] }, "maps.write")).toBe(false);
    expect(hasPermission({ roles: ["admin"] }, "maps.delete")).toBe(true);
  });

  test("limits content portability to editorial operators", () => {
    expect(hasPermission({ roles: ["admin"] }, "content.export")).toBe(true);
    expect(hasPermission({ roles: ["editor"] }, "content.import")).toBe(true);
    expect(hasPermission({ roles: ["author"] }, "content.export")).toBe(false);
    expect(hasPermission({ roles: ["viewer"] }, "content.import")).toBe(false);
  });

  test("allows editors to resolve redirects without destructive cleanup access", () => {
    expect(hasPermission({ roles: ["editor"] }, "redirects.read")).toBe(true);
    expect(hasPermission({ roles: ["editor"] }, "redirects.write")).toBe(true);
    expect(hasPermission({ roles: ["editor"] }, "redirects.delete")).toBe(false);
    expect(hasPermission({ roles: ["admin"] }, "redirects.delete")).toBe(true);
    expect(hasPermission({ roles: ["viewer"] }, "redirects.read")).toBe(false);
  });

  test("allows editors to search while reserving index maintenance for administrators", () => {
    expect(hasPermission({ roles: ["editor"] }, "search.read")).toBe(true);
    expect(hasPermission({ roles: ["editor"] }, "search.manage")).toBe(false);
    expect(hasPermission({ roles: ["admin"] }, "search.manage")).toBe(true);
    expect(hasPermission({ roles: ["viewer"] }, "search.read")).toBe(false);
  });
});
