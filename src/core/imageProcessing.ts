import path from "node:path";
import sharp, { type Metadata, type OutputInfo, type Sharp } from "sharp";
import { config } from "./config";
import { AppValidationError } from "./validation";

export type ImageVariantKind = "display" | "thumbnail" | "responsive";
export type ImageVariantFormat = "jpeg" | "png" | "webp" | "avif";

export type GeneratedImageVariant = {
  kind: ImageVariantKind;
  format: ImageVariantFormat;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  storedName: string;
  publicUrl: string;
  content: Uint8Array;
};

export type ImageProcessingResult = {
  width: number | null;
  height: number | null;
  metadata: Record<string, string | number | boolean | null>;
  variants: GeneratedImageVariant[];
};

export type ImageProcessingSettings = {
  derivativesEnabled: boolean;
  maxWidth: number;
  maxHeight: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
  webpQuality: number;
  avifQuality: number;
  maxInputPixels: number;
};

const derivativeMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function settingsFromConfig(): ImageProcessingSettings {
  return {
    derivativesEnabled: config.mediaImageDerivativesEnabled,
    maxWidth: config.mediaImageMaxWidth,
    maxHeight: config.mediaImageMaxHeight,
    thumbnailWidth: config.mediaThumbnailWidth,
    thumbnailHeight: config.mediaThumbnailHeight,
    webpQuality: config.mediaWebpQuality,
    avifQuality: config.mediaAvifQuality,
    maxInputPixels: config.mediaMaxInputPixels,
  };
}

function sharpInput(content: Uint8Array, settings: ImageProcessingSettings) {
  return sharp(content, {
    failOn: "warning",
    limitInputPixels: settings.maxInputPixels,
    limitInputChannels: 4,
  });
}

function orientedDimensions(metadata: Metadata) {
  const swapsAxes = metadata.orientation !== undefined && metadata.orientation >= 5 && metadata.orientation <= 8;
  return {
    width: swapsAxes ? metadata.height ?? null : metadata.width ?? null,
    height: swapsAxes ? metadata.width ?? null : metadata.height ?? null,
  };
}

function safeMetadata(metadata: Metadata) {
  return {
    format: metadata.format ?? null,
    colorSpace: metadata.space ?? null,
    channels: metadata.channels ?? null,
    hasAlpha: metadata.hasAlpha ?? false,
    orientation: metadata.orientation ?? null,
    density: metadata.density ?? null,
    pages: metadata.pages ?? 1,
    animated: (metadata.pages ?? 1) > 1,
  };
}

function resizedPipeline(content: Uint8Array, settings: ImageProcessingSettings, width: number, height: number) {
  return sharpInput(content, settings)
    .rotate()
    .resize({
      width,
      height,
      fit: "inside",
      withoutEnlargement: true,
    });
}

function originalFormatOutput(pipeline: Sharp, mimeType: string, settings: ImageProcessingSettings) {
  if (mimeType === "image/jpeg") return pipeline.jpeg({ quality: 88, mozjpeg: true });
  if (mimeType === "image/png") return pipeline.png({ compressionLevel: 9 });
  return pipeline.webp({ quality: settings.webpQuality, smartSubsample: true });
}

function variantName(storedName: string, suffix: string, extension: string) {
  const ext = path.extname(storedName);
  return `${storedName.slice(0, -ext.length)}-${suffix}${extension}`;
}

function variant(
  storedName: string,
  kind: ImageVariantKind,
  format: ImageVariantFormat,
  mimeType: string,
  content: Buffer,
  info: OutputInfo,
): GeneratedImageVariant {
  return {
    kind,
    format,
    mimeType,
    width: info.width,
    height: info.height,
    sizeBytes: info.size,
    storedName,
    publicUrl: `/cms/uploads/${storedName}`,
    content,
  };
}

export async function processImageUpload(
  content: Blob,
  mimeType: string,
  storedName: string,
  settings: ImageProcessingSettings = settingsFromConfig(),
): Promise<ImageProcessingResult | null> {
  if (!mimeType.startsWith("image/")) return null;

  try {
    const input = Buffer.from(await content.arrayBuffer());
    const metadata = await sharpInput(input, settings).metadata();
    const dimensions = orientedDimensions(metadata);
    if (!settings.derivativesEnabled || !derivativeMimeTypes.has(mimeType) || !dimensions.width || !dimensions.height) {
      return { ...dimensions, metadata: safeMetadata(metadata), variants: [] };
    }

    const displayPipeline = resizedPipeline(input, settings, settings.maxWidth, settings.maxHeight);
    const displayOutput = await originalFormatOutput(displayPipeline, mimeType, settings).toBuffer({ resolveWithObject: true });
    const originalFormat = mimeType === "image/jpeg" ? "jpeg" : mimeType === "image/png" ? "png" : "webp";
    const originalExtension = originalFormat === "jpeg" ? ".jpg" : `.${originalFormat}`;
    const variants: GeneratedImageVariant[] = [
      variant(
        variantName(storedName, "display", originalExtension),
        "display",
        originalFormat,
        mimeType,
        displayOutput.data,
        displayOutput.info,
      ),
    ];

    const thumbnailOutput = await resizedPipeline(input, settings, settings.thumbnailWidth, settings.thumbnailHeight)
      .webp({ quality: settings.webpQuality, smartSubsample: true })
      .toBuffer({ resolveWithObject: true });
    variants.push(variant(
      variantName(storedName, "thumbnail", ".webp"),
      "thumbnail",
      "webp",
      "image/webp",
      thumbnailOutput.data,
      thumbnailOutput.info,
    ));

    if (mimeType !== "image/webp") {
      const webpOutput = await resizedPipeline(input, settings, settings.maxWidth, settings.maxHeight)
        .webp({ quality: settings.webpQuality, smartSubsample: true })
        .toBuffer({ resolveWithObject: true });
      variants.push(variant(
        variantName(storedName, "responsive", ".webp"),
        "responsive",
        "webp",
        "image/webp",
        webpOutput.data,
        webpOutput.info,
      ));
    }

    const avifOutput = await resizedPipeline(input, settings, settings.maxWidth, settings.maxHeight)
      .avif({ quality: settings.avifQuality })
      .toBuffer({ resolveWithObject: true });
    variants.push(variant(
      variantName(storedName, "responsive", ".avif"),
      "responsive",
      "avif",
      "image/avif",
      avifOutput.data,
      avifOutput.info,
    ));

    return { ...dimensions, metadata: safeMetadata(metadata), variants };
  } catch {
    throw new AppValidationError("The image could not be decoded or processed safely.");
  }
}
