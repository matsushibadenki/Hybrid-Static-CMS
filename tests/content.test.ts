import { describe, expect, test } from "bun:test";
import { renderMarkdownLike, sanitizeRichHtml } from "../src/core/content";
import { sanitizeSvgContent } from "../src/core/media";
import { renderFormSubmissionsCsv } from "../src/core/forms";

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
});
