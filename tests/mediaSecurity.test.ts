import { describe, expect, test } from "bun:test";
import {
  detectMediaReferences,
  mediaEmbedSnippet,
  safeMediaStoredName,
  storedExtensionForMimeType,
  validateMediaFileContent,
  type MediaRecord,
} from "../src/core/media";
import { AppValidationError } from "../src/core/validation";

const pngBytes = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));

function mediaFixture(overrides: Partial<MediaRecord> = {}): MediaRecord {
  return {
    id: 1,
    originalName: "image.png",
    storedName: "stored.png",
    mimeType: "image/png",
    sizeBytes: pngBytes.byteLength,
    altText: "Image",
    publicUrl: "/cms/uploads/stored.png",
    uploadedAt: "2026-01-01T00:00:00.000Z",
    uploaderName: "Owner",
    width: 1,
    height: 1,
    metadata: {},
    variants: [],
    ...overrides,
  };
}

describe("media security", () => {
  test("uses a canonical extension derived from the accepted media type", () => {
    const storedName = safeMediaStoredName("payload.html", "image/png");
    expect(storedName.endsWith(".png")).toBe(true);
    expect(storedName.endsWith(".html")).toBe(false);
    expect(storedExtensionForMimeType("application/pdf")).toBe(".pdf");
    expect(storedExtensionForMimeType("unknown/type")).toBe(".bin");
  });

  test("accepts a complete PNG and rejects a truncated signature-only file", async () => {
    await expect(validateMediaFileContent(new File([pngBytes], "valid.png", { type: "image/png" }))).resolves.toBeUndefined();
    await expect(validateMediaFileContent(new File([pngBytes.slice(0, 16)], "truncated.png", { type: "image/png" }))).rejects.toBeInstanceOf(AppValidationError);
  });

  test("rejects undersized container headers", async () => {
    const fixtures = [
      new File([new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0])], "short.webp", { type: "image/webp" }),
      new File([new Uint8Array([0, 0, 0, 8])], "short.mp4", { type: "video/mp4" }),
      new File([new Uint8Array([0x52, 0x49, 0x46, 0x46])], "short.wav", { type: "audio/wav" }),
    ];
    for (const file of fixtures) {
      await expect(validateMediaFileContent(file)).rejects.toBeInstanceOf(AppValidationError);
    }
  });

  test("accepts a passive PDF document", async () => {
    const pdf = new File(["%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"], "document.pdf", {
      type: "application/pdf",
    });
    await expect(validateMediaFileContent(pdf)).resolves.toBeUndefined();
  });

  test("rejects active PDF actions including escaped PDF names", async () => {
    for (const marker of ["/JavaScript", "/Java#53cript", "/Launch", "/EmbeddedFile", "/RichMedia", "/XFA"]) {
      const pdf = new File([`%PDF-1.4\n1 0 obj\n<< /S ${marker} >>\nendobj\n%%EOF\n`], "active.pdf", {
        type: "application/pdf",
      });
      await expect(validateMediaFileContent(pdf)).rejects.toThrow("PDF files containing active content are not allowed.");
    }
  });

  test("escapes generated media embed attributes and labels", () => {
    const snippet = mediaEmbedSnippet(mediaFixture({
      altText: '" onerror="alert(1)',
      publicUrl: '/cms/uploads/image.png?value="bad"',
    }));
    expect(snippet).toContain("&quot;");
    expect(snippet).not.toContain('onerror="alert(1)');

    const pdfSnippet = mediaEmbedSnippet(mediaFixture({
      originalName: "<script>alert(1)</script>.pdf",
      mimeType: "application/pdf",
      publicUrl: "/cms/uploads/document.pdf",
    }));
    expect(pdfSnippet).not.toContain("<script>");
    expect(pdfSnippet).toContain("&lt;script&gt;");
  });

  test("uses modern image variants in a responsive picture element", () => {
    const snippet = mediaEmbedSnippet(mediaFixture({
      width: 1200,
      height: 800,
      variants: [
        { id: 1, kind: "display", format: "png", mimeType: "image/png", width: 1200, height: 800, sizeBytes: 1000, storedName: "display.png", publicUrl: "/cms/uploads/display.png" },
        { id: 2, kind: "responsive", format: "webp", mimeType: "image/webp", width: 1200, height: 800, sizeBytes: 700, storedName: "display.webp", publicUrl: "/cms/uploads/display.webp" },
        { id: 3, kind: "responsive", format: "avif", mimeType: "image/avif", width: 1200, height: 800, sizeBytes: 500, storedName: "display.avif", publicUrl: "/cms/uploads/display.avif" },
      ],
    }));
    expect(snippet).toContain("<picture>");
    expect(snippet).toContain('type="image/avif"');
    expect(snippet).toContain('type="image/webp"');
    expect(snippet).toContain('src="/cms/uploads/display.png"');
    expect(snippet).toContain('width="1200" height="800"');
    expect(snippet).toContain('loading="lazy" decoding="async"');
  });

  test("detects original and derived media references without duplicates", () => {
    const media = mediaFixture({
      variants: [
        { id: 2, kind: "display", format: "png", mimeType: "image/png", width: 1, height: 1, sizeBytes: 20, storedName: "display.png", publicUrl: "/cms/uploads/display.png" },
      ],
    });
    const references = detectMediaReferences(media, [
      { sourceType: "post", sourceId: "10", title: "Referenced post", field: "content", value: '<img src="/cms/uploads/stored.png"><img src="/cms/uploads/display.png">' },
      { sourceType: "public_file", sourceId: "index.html", title: "index.html", field: "file", value: "cms/uploads/display.png" },
      { sourceType: "page", sourceId: "20", title: "Unrelated page", field: "content", value: "/cms/uploads/other.png" },
    ]);

    expect(references).toEqual([
      { sourceType: "post", sourceId: "10", title: "Referenced post", field: "content" },
      { sourceType: "public_file", sourceId: "index.html", title: "index.html", field: "file" },
    ]);
  });
});
