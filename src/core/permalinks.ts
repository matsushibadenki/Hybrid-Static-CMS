export const postPermalinkPatterns = ["post_name", "year_month", "category", "numeric"] as const;

export type PostPermalinkPattern = (typeof postPermalinkPatterns)[number];

export type PermalinkPost = {
  id: number;
  slug: string;
  publishedAt: string | null;
  updatedAt: string;
  categories: string[];
  locale?: ContentLocale;
};

export function isPostPermalinkPattern(value: string): value is PostPermalinkPattern {
  return postPermalinkPatterns.includes(value as PostPermalinkPattern);
}

function publicationDate(post: PermalinkPost) {
  const date = new Date(post.publishedAt || post.updatedAt);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

export function postPermalinkPath(post: PermalinkPost, pattern: PostPermalinkPattern) {
  const basePath = `${cmsLocalePath(post.locale ?? "en")}/posts`;
  if (pattern === "numeric") return `${basePath}/${post.id}.html`;
  if (pattern === "category") {
    return `${basePath}/category/${post.categories[0] || "uncategorized"}/${post.slug}.html`;
  }
  if (pattern === "year_month") {
    const date = publicationDate(post);
    const year = String(date.getUTCFullYear()).padStart(4, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${basePath}/${year}/${month}/${post.slug}.html`;
  }
  return `${basePath}/${post.slug}.html`;
}

export function postArtifactRelativePath(post: PermalinkPost, pattern: PostPermalinkPattern) {
  return postPermalinkPath(post, pattern).replace(/^\/cms\//, "");
}

export function postPermalinkExample(pattern: PostPermalinkPattern) {
  const example = {
    id: 123,
    slug: "sample-article",
    publishedAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:00.000Z",
    categories: ["news"],
  };
  return postPermalinkPath(example, pattern);
}
import { cmsLocalePath, type ContentLocale } from "./locales";
