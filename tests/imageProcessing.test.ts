import { describe, expect, test } from "bun:test";
import { processImageUpload, type ImageProcessingSettings } from "../src/core/imageProcessing";

const pngBytes = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));

const settings: ImageProcessingSettings = {
  derivativesEnabled: true,
  maxWidth: 1200,
  maxHeight: 1200,
  thumbnailWidth: 320,
  thumbnailHeight: 240,
  webpQuality: 80,
  avifQuality: 50,
  maxInputPixels: 40_000_000,
};

describe("image processing", () => {
  test("extracts metadata and generates display, thumbnail, WebP, and AVIF assets", async () => {
    const result = await processImageUpload(
      new Blob([pngBytes], { type: "image/png" }),
      "image/png",
      "asset.png",
      settings,
    );

    expect(result?.width).toBe(1);
    expect(result?.height).toBe(1);
    expect(result?.metadata.format).toBe("png");
    expect(result?.variants.map((variant) => `${variant.kind}:${variant.format}`)).toEqual([
      "display:png",
      "thumbnail:webp",
      "responsive:webp",
      "responsive:avif",
    ]);
    for (const variant of result?.variants ?? []) {
      expect(variant.sizeBytes).toBeGreaterThan(0);
      expect(variant.width).toBe(1);
      expect(variant.height).toBe(1);
      expect(variant.publicUrl).toStartWith("/cms/uploads/");
    }
  });

  test("keeps metadata extraction enabled when derivative generation is disabled", async () => {
    const result = await processImageUpload(
      new Blob([pngBytes], { type: "image/png" }),
      "image/png",
      "asset.png",
      { ...settings, derivativesEnabled: false },
    );
    expect(result?.width).toBe(1);
    expect(result?.height).toBe(1);
    expect(result?.variants).toEqual([]);
  });

  test("does not process non-image media", async () => {
    const result = await processImageUpload(
      new Blob(["plain text"], { type: "text/plain" }),
      "text/plain",
      "document.txt",
      settings,
    );
    expect(result).toBeNull();
  });
});
