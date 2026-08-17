import { describe, expect, test } from "bun:test";
import {
  assertEditorialFingerprintPublishAllowed,
  pageEditorialFingerprint,
  postEditorialFingerprint,
} from "../src/core/editorialFingerprint";
import { AppValidationError } from "../src/core/validation";

const postInput = {
  title: "Editorial article",
  slug: "editorial-article",
  excerpt: "Summary",
  bodyMd: "# Body",
  bodyHtml: "<h1>Body</h1>",
  status: "draft" as const,
  categorySlugs: ["news", "design"],
  tagSlugs: ["cms", "release"],
};

describe("editorial approval fingerprints", () => {
  test("normalizes category and tag ordering", () => {
    const reordered = {
      ...postInput,
      categorySlugs: ["design", "news"],
      tagSlugs: ["release", "cms"],
      status: "published" as const,
    };
    expect(postEditorialFingerprint(reordered)).toBe(postEditorialFingerprint(postInput));
  });

  test("changes when editorial content changes", () => {
    expect(postEditorialFingerprint({ ...postInput, bodyMd: "# Changed" })).not.toBe(postEditorialFingerprint(postInput));
    expect(pageEditorialFingerprint({ ...postInput, stylesheetPath: "pages/a.css" })).not.toBe(
      pageEditorialFingerprint({ ...postInput, stylesheetPath: "pages/b.css" }),
    );
  });

  test("blocks active, returned, and modified approvals", () => {
    const hash = postEditorialFingerprint(postInput);
    expect(() => assertEditorialFingerprintPublishAllowed("draft", null, hash)).not.toThrow();
    expect(() => assertEditorialFingerprintPublishAllowed("approved", hash, hash)).not.toThrow();
    expect(() => assertEditorialFingerprintPublishAllowed("in_review", hash, hash)).toThrow(AppValidationError);
    expect(() => assertEditorialFingerprintPublishAllowed("changes_requested", null, hash)).toThrow(AppValidationError);
    expect(() => assertEditorialFingerprintPublishAllowed("approved", hash, `${hash}-changed`)).toThrow(AppValidationError);
  });
});
