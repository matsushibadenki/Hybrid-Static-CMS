import sanitizeHtml from "sanitize-html";

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function renderMarkdownLike(markdown: string) {
  const paragraphs = markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (block.startsWith("```mermaid") && block.endsWith("```")) {
        const chart = block.slice("```mermaid".length, -3).trim();
        return `<pre><code class="language-mermaid">${escapeHtml(chart)}</code></pre>`;
      }
      if (block.startsWith("## ")) {
        return `<h2>${escapeHtml(block.slice(3))}</h2>`;
      }
      if (block.startsWith("# ")) {
        return `<h1>${escapeHtml(block.slice(2))}</h1>`;
      }
      return `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`;
    });

  return sanitizeRichHtml(paragraphs.join("\n"));
}

export function sanitizeRichHtml(value: string) {
  return sanitizeHtml(value, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "s",
      "del",
      "ul",
      "ol",
      "li",
      "a",
      "blockquote",
      "code",
      "pre",
      "h1",
      "h2",
      "h3",
      "h4",
      "hr",
      "div",
      "span",
      "ruby",
      "rt",
      "rp",
      "img",
      "video",
      "audio",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      p: ["class", "style"],
      div: ["class", "style"],
      span: ["class", "style"],
      ruby: ["class"],
      rt: ["class"],
      rp: ["class"],
      h1: ["class", "style"],
      h2: ["class", "style"],
      h3: ["class", "style"],
      h4: ["class", "style"],
      blockquote: ["class", "style"],
      code: ["class"],
      pre: ["class"],
      img: ["src", "alt", "title"],
      video: ["controls", "src"],
      audio: ["controls", "src"],
    },
    allowedClasses: {
      p: ["align-left", "align-center", "align-right", "align-justify"],
      div: ["align-left", "align-center", "align-right", "align-justify"],
      span: ["align-left", "align-center", "align-right", "align-justify", "text-size-small", "text-size-normal", "text-size-large", "text-size-xlarge"],
      ruby: ["ruby-small", "ruby-large"],
      rt: ["ruby-small", "ruby-large"],
      rp: ["ruby-small", "ruby-large"],
      h1: ["align-left", "align-center", "align-right", "align-justify"],
      h2: ["align-left", "align-center", "align-right", "align-justify"],
      h3: ["align-left", "align-center", "align-right", "align-justify"],
      h4: ["align-left", "align-center", "align-right", "align-justify"],
      blockquote: ["align-left", "align-center", "align-right", "align-justify"],
      code: ["language-mermaid"],
      pre: ["mermaid"],
    },
    allowedStyles: {
      "*": {
        "text-align": [/^(left|center|right|justify)$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto"],
  });
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
