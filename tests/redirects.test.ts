import { describe, expect, test } from "bun:test";
import { normalizeRedirectSource, normalizeRedirectTarget, shouldTrackNotFound } from "../src/core/redirects";

describe("redirect validation", () => {
  test("normalizes internal paths and permits HTTPS destinations", () => {
    expect(normalizeRedirectSource("/old//section/../page.html/")).toBe("/old/page.html");
    expect(normalizeRedirectTarget("/new//page.html?from=old#top")).toBe("/new/page.html?from=old#top");
    expect(normalizeRedirectTarget("https://example.com/new-page")).toBe("https://example.com/new-page");
  });

  test("rejects unsafe, ambiguous, and protected sources or targets", () => {
    expect(() => normalizeRedirectSource("https://example.com/old")).toThrow("internal path");
    expect(() => normalizeRedirectSource("//example.com/old")).toThrow("internal path");
    expect(() => normalizeRedirectSource("/control-panel/users")).toThrow("protected application path");
    expect(() => normalizeRedirectSource("/old?tracking=yes")).toThrow("without a query");
    expect(() => normalizeRedirectTarget("http://example.com/insecure")).toThrow("must use HTTPS");
    expect(() => normalizeRedirectTarget("javascript:alert(1)")).toThrow("must use HTTPS");
  });

  test("does not track application-internal 404 paths", () => {
    expect(shouldTrackNotFound("/missing-public-page.html")).toBe(true);
    expect(shouldTrackNotFound("/cms-api/private")).toBe(false);
    expect(shouldTrackNotFound("/control-panel/private")).toBe(false);
    expect(shouldTrackNotFound("/preview/post/draft")).toBe(false);
  });
});
