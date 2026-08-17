import type { PageInput, PageRecord, PostInput, PostRecord } from "./types";
import type { EditorialWorkflowState } from "./types";
import { AppValidationError } from "./validation";

function normalizeText(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function digest(value: unknown) {
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(value)).digest("hex");
}

export function assertEditorialFingerprintPublishAllowed(
  state: EditorialWorkflowState,
  approvedHash: string | null,
  incomingHash: string,
) {
  if (state === "in_review") throw new AppValidationError("Approve or withdraw the current review before publishing.");
  if (state === "changes_requested") throw new AppValidationError("Requested changes must be saved and reviewed before publishing.");
  if (state === "approved" && approvedHash && approvedHash !== incomingHash) {
    throw new AppValidationError("Approved content changed. Save it and submit it for review again before publishing.");
  }
}

export function postEditorialFingerprint(value: PostInput | PostRecord) {
  const categories = "categorySlugs" in value ? value.categorySlugs : (value as PostRecord).categories;
  const tags = "tagSlugs" in value ? value.tagSlugs : (value as PostRecord).tags;
  return digest({
    title: normalizeText(value.title), slug: normalizeText(value.slug), excerpt: normalizeText(value.excerpt),
    bodyMd: normalizeText(value.bodyMd), bodyHtml: normalizeText(value.bodyHtml),
    seoTitle: normalizeText(value.seoTitle), seoDescription: normalizeText(value.seoDescription),
    seoCanonicalUrl: normalizeText(value.seoCanonicalUrl), seoOgImage: normalizeText(value.seoOgImage),
    seoKeywords: normalizeText(value.seoKeywords), seoNoindex: Boolean(value.seoNoindex), seoNofollow: Boolean(value.seoNofollow),
    categories: [...(categories ?? [])].map(normalizeText).filter(Boolean).sort(),
    tags: [...(tags ?? [])].map(normalizeText).filter(Boolean).sort(),
  });
}

export function pageEditorialFingerprint(value: PageInput | PageRecord) {
  return digest({
    title: normalizeText(value.title), slug: normalizeText(value.slug), excerpt: normalizeText(value.excerpt),
    bodyMd: normalizeText(value.bodyMd), bodyHtml: normalizeText(value.bodyHtml),
    seoTitle: normalizeText(value.seoTitle), seoDescription: normalizeText(value.seoDescription),
    seoCanonicalUrl: normalizeText(value.seoCanonicalUrl), seoOgImage: normalizeText(value.seoOgImage),
    seoKeywords: normalizeText(value.seoKeywords), seoNoindex: Boolean(value.seoNoindex), seoNofollow: Boolean(value.seoNofollow),
    stylesheetPath: normalizeText(value.stylesheetPath),
  });
}
