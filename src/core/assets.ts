import path from "node:path";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { config } from "./config";
import { AppValidationError } from "./validation";

export type StylesheetScope = "categories" | "pages";

const starterStylesheets: Record<StylesheetScope, string> = {
  categories: `/*
 * Category stylesheet
 * Assign this file to a post category from the control panel.
 */

.hybrid-static-cms-prose {
  /* Add category-specific article styles here. */
}
`,
  pages: `/*
 * Fixed-page stylesheet
 * Select this file from a fixed page's basic information settings.
 */

.hybrid-static-cms-page {
  /* Add fixed-page-specific styles here. */
}
`,
};

export function publicAssetsDir(publicHtmlDir = config.publicHtmlDir) {
  return path.join(publicHtmlDir, "assets");
}

export async function ensurePublicAssetDirectories(publicHtmlDir = config.publicHtmlDir) {
  const assetsDir = publicAssetsDir(publicHtmlDir);
  const directories = [
    path.join(assetsDir, "css", "categories"),
    path.join(assetsDir, "css", "pages"),
    path.join(assetsDir, "img"),
    path.join(assetsDir, "js"),
    path.join(assetsDir, "video"),
  ];
  await Promise.all(directories.map((directory) => mkdir(directory, { recursive: true })));

  await Promise.all((Object.keys(starterStylesheets) as StylesheetScope[]).map(async (scope) => {
    const filePath = path.join(assetsDir, "css", scope, "default.css");
    try {
      await writeFile(filePath, starterStylesheets[scope], { encoding: "utf8", flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }));
  try {
    await writeFile(
      path.join(assetsDir, "css", "site.css"),
      "/* Shared public-site styles. Content-specific stylesheets load after this file. */\n",
      { encoding: "utf8", flag: "wx" },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }

  return assetsDir;
}

export function normalizeStylesheetPath(value: string | null | undefined, scope: StylesheetScope) {
  const input = value?.trim();
  if (!input) return null;
  if (input.includes("\\") || path.posix.isAbsolute(input)) {
    throw new AppValidationError("Select a valid stylesheet from the public assets directory.");
  }
  const normalized = path.posix.normalize(input);
  const segments = normalized.split("/");
  if (
    !normalized.startsWith(`${scope}/`) ||
    !normalized.toLowerCase().endsWith(".css") ||
    segments.some((segment) => !segment || segment === "." || segment === ".." || segment.startsWith("."))
  ) {
    throw new AppValidationError("Select a valid stylesheet from the public assets directory.");
  }
  return normalized;
}

async function collectCssFiles(root: string, relativeDir = ""): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(path.join(root, relativeDir), { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.isSymbolicLink()) continue;
    const relativePath = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) files.push(...await collectCssFiles(root, relativePath));
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".css")) files.push(relativePath);
  }
  return files;
}

export async function listStylesheets(scope: StylesheetScope, publicHtmlDir = config.publicHtmlDir) {
  await ensurePublicAssetDirectories(publicHtmlDir);
  const cssRoot = path.join(publicAssetsDir(publicHtmlDir), "css");
  const files = await collectCssFiles(path.join(cssRoot, scope));
  return files.map((file) => `${scope}/${file}`).sort((a, b) => a.localeCompare(b));
}

export async function requireExistingStylesheet(value: string | null | undefined, scope: StylesheetScope) {
  const normalized = normalizeStylesheetPath(value, scope);
  if (!normalized) return null;
  const available = await listStylesheets(scope);
  if (!available.includes(normalized)) {
    throw new AppValidationError("The selected stylesheet no longer exists.");
  }
  return normalized;
}

export function stylesheetPublicUrl(value: string | null | undefined, scope: StylesheetScope) {
  try {
    const normalized = normalizeStylesheetPath(value, scope);
    return normalized ? `/assets/css/${normalized.split("/").map(encodeURIComponent).join("/")}` : null;
  } catch {
    return null;
  }
}
