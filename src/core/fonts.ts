import path from "node:path";
import { randomUUID } from "node:crypto";
import { lstat, readdir, unlink, writeFile } from "node:fs/promises";
import { publicAssetsDir, ensurePublicAssetDirectories } from "./assets";
import { config } from "./config";
import { AppValidationError } from "./validation";

const maxFontBytes = 10 * 1024 * 1024;
const maxFontFiles = 32;
const extensions = ["woff2", "woff", "ttf", "otf"] as const;
type FontExtension = (typeof extensions)[number];

export type LocalFontFile = { name: string; publicUrl: string; sizeBytes: number; format: FontExtension };

export function localFontsDir(publicHtmlDir = config.publicHtmlDir) {
  return path.join(publicAssetsDir(publicHtmlDir), "fonts");
}

function detectedExtension(bytes: Uint8Array): FontExtension | null {
  const signature = String.fromCharCode(...bytes.slice(0, 4));
  if (signature === "wOF2") return "woff2";
  if (signature === "wOFF") return "woff";
  if (signature === "OTTO") return "otf";
  if (signature === "true" || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) return "ttf";
  return null;
}

function safeFontFileName(value: string) {
  if (value !== path.basename(value) || value.startsWith(".") || !/^[a-z0-9][a-z0-9._-]*\.(woff2?|ttf|otf)$/i.test(value)) {
    throw new AppValidationError("Select a valid local font file.");
  }
  return value;
}

export async function listLocalFontFiles(publicHtmlDir = config.publicHtmlDir): Promise<LocalFontFile[]> {
  await ensurePublicAssetDirectories(publicHtmlDir);
  const directory = localFontsDir(publicHtmlDir);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: LocalFontFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
    try { safeFontFileName(entry.name); } catch { continue; }
    const extension = entry.name.toLowerCase().split(".").pop();
    if (!extensions.includes(extension as FontExtension)) continue;
    const info = await lstat(path.join(directory, entry.name));
    if (!info.isFile() || info.isSymbolicLink()) continue;
    files.push({ name: entry.name, publicUrl: `/assets/fonts/${encodeURIComponent(entry.name)}`, sizeBytes: info.size, format: extension as FontExtension });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}

export async function uploadLocalFont(file: File, publicHtmlDir = config.publicHtmlDir) {
  if (!file.name) throw new AppValidationError("A font file is required.");
  if (file.size < 4 || file.size > maxFontBytes) throw new AppValidationError("Font files must be between 4 bytes and 10 MB.");
  const existing = await listLocalFontFiles(publicHtmlDir);
  if (existing.length >= maxFontFiles) throw new AppValidationError("No more than 32 local font files can be stored.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = detectedExtension(bytes);
  if (!extension) throw new AppValidationError("The file is not a supported WOFF2, WOFF, TTF, or OTF font.");
  const stem = path.parse(file.name).name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "font";
  const name = `${stem}-${randomUUID().slice(0, 8)}.${extension}`;
  await writeFile(path.join(localFontsDir(publicHtmlDir), name), bytes, { flag: "wx", mode: 0o644 });
  return name;
}

export async function deleteLocalFont(name: string, publicHtmlDir = config.publicHtmlDir) {
  const safeName = safeFontFileName(name);
  const filePath = path.join(localFontsDir(publicHtmlDir), safeName);
  const info = await lstat(filePath).catch(() => null);
  if (!info || !info.isFile() || info.isSymbolicLink()) throw new AppValidationError("The selected local font no longer exists.");
  await unlink(filePath);
}
