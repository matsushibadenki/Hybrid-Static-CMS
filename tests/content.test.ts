import { describe, expect, test } from "bun:test";
import { buildScopedSlug, renderMarkdownLike, sanitizeRichHtml } from "../src/core/content";
import { sanitizeSvgContent } from "../src/core/media";
import { renderFormSubmissionsCsv, validateFormSubmission } from "../src/core/forms";
import type { FormRecord } from "../src/core/types";
import { AppValidationError } from "../src/core/validation";
import { renderEmbedScript, renderPost } from "../src/core/renderer";
import type { PostRecord } from "../src/core/types";
import type { SeriesNavigation } from "../src/core/series";
import { validateCommentInput } from "../src/core/comments";

const submissionForm: FormRecord = {
  id: 1,
  title: "Contact",
  slug: "contact",
  description: null,
  status: "published",
  submitLabel: "Send",
  successMessage: "Thanks",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  authorId: null,
  authorName: null,
  fields: [
    { id: 1, formId: 1, name: "email", label: "Email", type: "email", required: true, options: [], sortOrder: 0 },
    { id: 2, formId: 1, name: "topic", label: "Topic", type: "select", required: false, options: ["support", "sales"], sortOrder: 1 },
  ],
};

function postFixture(id: number, title: string, slug: string): PostRecord {
  return {
    id,
    locale: "en",
    translationGroup: "00000000-0000-4000-8000-000000000001",
    title,
    slug,
    excerpt: null,
    bodyMd: null,
    bodyHtml: "<p>Body</p>",
    status: "published",
    seoTitle: null,
    seoDescription: null,
    seoCanonicalUrl: null,
    seoOgImage: null,
    seoKeywords: null,
    seoNoindex: false,
    seoNofollow: false,
    publishedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    authorId: null,
    authorName: null,
    categories: [],
    categoryStylesheets: [],
    tags: [],
    commentsPolicy: "enabled",
  commentsEnabled: true,
  workflowState: "approved",
  workflowContentHash: null,
  workflowNote: null,
  reviewRequestedAt: null,
  reviewRequestedBy: null,
  reviewedAt: null,
  reviewedBy: null,
};
}

describe("content formatting", () => {
  test("preserves supported article markup and removes scripts", () => {
    const html = sanitizeRichHtml(`
      <strong>bold</strong>
      <s>removed</s>
      <blockquote>quote</blockquote>
      <ul><li>item</li></ul>
      <ruby>漢字<rt>かんじ</rt><rp>(</rp><rp>)</rp></ruby>
      <script>alert(1)</script>
    `);

    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<s>removed</s>");
    expect(html).toContain("<blockquote>quote</blockquote>");
    expect(html).toContain("<ruby>漢字<rt>かんじ</rt>");
    expect(html).not.toContain("<script");
  });

  test("renders Mermaid fenced blocks as safe code blocks", () => {
    const html = renderMarkdownLike("```mermaid\ngraph TD\n  A[Start] --> B[End]\n```");
    expect(html).toContain('<code class="language-mermaid">');
    expect(html).toContain("graph TD");
    expect(html).toContain("--&gt;");
  });

  test("keeps LaTeX delimiters in Markdown-like content", () => {
    const html = renderMarkdownLike("The formula is \\(x^2\\).");
    expect(html).toContain("\\(x^2\\)");
  });

  test("sanitizes active SVG content", () => {
    const svg = sanitizeSvgContent('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject><p>bad</p></foreignObject><circle cx="5" cy="5" r="4" onclick="alert(2)" /></svg>');
    expect(svg).toContain("<svg");
    expect(svg).toContain("<circle");
    expect(svg).not.toContain("script");
    expect(svg).not.toContain("foreignObject");
    expect(svg).not.toContain("onclick");
  });

  test("renders form submissions as escaped CSV", () => {
    const csv = renderFormSubmissionsCsv({
      id: 1,
      title: "Contact",
      slug: "contact",
      description: null,
      status: "published",
      submitLabel: "Send",
      successMessage: "Thanks",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      authorId: null,
      authorName: null,
      fields: [{ id: 1, formId: 1, name: "message", label: "Message", type: "text", required: false, options: [], sortOrder: 0 }],
    }, [{ id: 1, createdAt: "2026-01-01T00:00:00.000Z", payload: { message: 'Hello, "world"' } }]);
    expect(csv).toContain('"created_at","message"');
    expect(csv).toContain('"Hello, ""world"""');
  });

  test("validates required public form fields and allowed options", () => {
    const missing = new FormData();
    expect(() => validateFormSubmission(submissionForm, missing)).toThrow(AppValidationError);

    const invalid = new FormData();
    invalid.set("email", "visitor@example.test");
    invalid.set("topic", "internal-only");
    expect(() => validateFormSubmission(submissionForm, invalid)).toThrow(AppValidationError);

    const valid = new FormData();
    valid.set("email", "visitor@example.test");
    valid.set("topic", "support");
    expect(validateFormSubmission(submissionForm, valid)).toEqual({ email: "visitor@example.test", topic: "support" });
  });

  test("builds embed cards without inserting API content through innerHTML", () => {
    const script = renderEmbedScript();
    expect(script).toContain("link.textContent");
    expect(script).toContain("excerpt.textContent");
    expect(script).not.toContain("node.innerHTML = data.items");
  });

  test("does not create a trailing scoped slug when a title cannot be slugified", () => {
    expect(buildScopedSlug("", "日本語タイトル", "news")).toBe("");
    expect(buildScopedSlug("", "Release Notes", "news")).toBe("news-release-notes");
    expect(buildScopedSlug("custom", "Release Notes", "news")).toBe("custom");
  });

  test("renders ordered previous, next, and numbered links for a post series", () => {
    const current = postFixture(2, "Part Two", "part-two");
    const series: SeriesNavigation = {
      id: 1,
      title: "Complete Guide",
      slug: "complete-guide",
      posts: [
        { id: 1, title: "Part One", slug: "part-one", position: 0, publishedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", categories: [] },
        { id: 2, title: "Part Two", slug: "part-two", position: 1, publishedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", categories: [] },
        { id: 3, title: "Part Three", slug: "part-three", position: 2, publishedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", categories: [] },
      ],
    };
    const html = renderPost(current, series);
    expect(html).toContain("Complete Guide");
    expect(html).not.toContain("first-letter");
    expect(html).toContain('/cms/posts/part-one.html');
    expect(html).toContain('/cms/posts/part-three.html');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('color: var(--on-ink)');
    expect(html).not.toContain('color: var(--paper)');
    expect(html).toContain("2 / 3");
    const categorizedHtml = renderPost(current, series, "category");
    expect(categorizedHtml).toContain('/cms/posts/category/uncategorized/part-one.html');
    expect(categorizedHtml).toContain('/cms/posts/category/uncategorized/part-three.html');
  });

  test("loads safe category stylesheets after the built-in page styles", () => {
    const html = renderPost({
      ...postFixture(5, "Styled post", "styled-post"),
      categoryStylesheets: ["categories/news.css", "../private.css"],
    });
    expect(html).toContain('href="/assets/css/categories/news.css"');
    expect(html).not.toContain("private.css");
    expect(html.indexOf("</style>")).toBeLessThan(html.indexOf('href="/assets/css/categories/news.css"'));
  });

  test("emits locale metadata and translation links for published content", () => {
    const post = { ...postFixture(9, "日本語の記事", "same-slug"), locale: "ja" as const };
    const html = renderPost(post, null, "post_name", [], post.bodyHtml, [
      { locale: "en", title: "English article", url: "https://example.test/cms/posts/same-slug.html" },
      { locale: "ja", title: post.title, url: "https://example.test/cms/ja/posts/same-slug.html" },
    ]);
    expect(html).toContain('lang="ja"');
    expect(html).toContain('hreflang="ja"');
    expect(html).toContain('href="https://example.test/cms/ja/posts/same-slug.html"');
  });

  test("renders approved comments without exposing email addresses", () => {
    const post = postFixture(4, "Comments", "comments");
    const html = renderPost(post, null, "post_name", [{
      id: 7,
      postId: post.id,
      postTitle: post.title,
      authorName: "Reader",
      authorEmail: "private@example.com",
      body: "Useful <script>alert(1)</script>",
      status: "approved",
      createdAt: "2026-01-02T00:00:00.000Z",
      approvedAt: "2026-01-03T00:00:00.000Z",
    }]);
    expect(html).toContain("Reader");
    expect(html).toContain("Useful &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("private@example.com");
    expect(html).toContain(`/cms-api/comments/${post.id}/submit`);
  });

  test("validates and normalizes public comments", () => {
    expect(validateCommentInput({ authorName: " Reader ", authorEmail: "USER@Example.com", body: " Hello " })).toEqual({ authorName: "Reader", authorEmail: "user@example.com", body: "Hello" });
    expect(() => validateCommentInput({ authorName: "", authorEmail: "invalid", body: "" })).toThrow();
  });
});
