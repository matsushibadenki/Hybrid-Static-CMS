import { sql } from "./db";
import { isPostPermalinkPattern, type PostPermalinkPattern } from "./permalinks";
import { AppValidationError } from "./validation";
import { isPublicThemeKitId, publicThemeKitCss, type PublicThemeKitId } from "./themeKits";

const postPermalinkSettingKey = "post_permalink_pattern";
const publicThemeSettingKey = "public_theme_v1";

export const fontDeliveryModes = ["remote", "local", "system"] as const;
export type FontDeliveryMode = (typeof fontDeliveryModes)[number];
export type LocalFontFace = { file: string; family: string; weight: string; style: "normal" | "italic" };

export interface PublicThemeSettings {
  kitId: PublicThemeKitId;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  accentColor: string;
  bodyFont: string;
  headingFont: string;
  monoFont: string;
  googleFontsCssUrls: string[];
  fontDeliveryMode: FontDeliveryMode;
  localFontFaces: LocalFontFace[];
  contentWidth: number;
  spacingUnit: number;
  bodyFontSize: number;
  lineHeight: number;
  cornerRadius: number;
}

export function defaultPublicThemeSettings(googleFontsCssUrls: string[] = []): PublicThemeSettings {
  return {
    kitId: "editorial",
    backgroundColor: "#ffffff",
    surfaceColor: "#ffffff",
    textColor: "#333333",
    mutedColor: "#777777",
    borderColor: "#ebebeb",
    accentColor: "#41c9b4",
    bodyFont: "Noto Sans JP",
    headingFont: "Noto Serif JP",
    monoFont: "Noto Sans Mono",
    googleFontsCssUrls: [...googleFontsCssUrls],
    fontDeliveryMode: "remote",
    localFontFaces: [],
    contentWidth: 780,
    spacingUnit: 8,
    bodyFontSize: 16,
    lineHeight: 1.8,
    cornerRadius: 6,
  };
}

function validHexColor(value: unknown, fallback: string) {
  const color = String(value ?? "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(color) ? color : fallback;
}

function validFontName(value: unknown, fallback: string) {
  const name = String(value ?? "").trim();
  return name.length >= 1 && name.length <= 80 && /^[\p{L}\p{N} ._-]+$/u.test(name) ? name : fallback;
}

function isFontDeliveryMode(value: unknown): value is FontDeliveryMode {
  return fontDeliveryModes.includes(value as FontDeliveryMode);
}

function validFontWeight(value: unknown) {
  const weight = String(value ?? "400").trim();
  if (/^[1-9]00$/.test(weight)) return weight;
  const range = weight.match(/^([1-9]00) ([1-9]00)$/);
  return range && Number(range[1]) <= Number(range[2]) ? weight : null;
}

export function normalizeLocalFontFaces(value: unknown, strict = false): LocalFontFace[] {
  const source = Array.isArray(value) ? value : [];
  const faces: LocalFontFace[] = [];
  for (const item of source) {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const file = String(record.file ?? "").trim();
    const family = String(record.family ?? "").trim();
    const weight = validFontWeight(record.weight);
    const style = record.style === "italic" ? "italic" : record.style === "normal" ? "normal" : null;
    const valid = /^[a-z0-9][a-z0-9._-]*\.(woff2?|ttf|otf)$/i.test(file) && family.length >= 1 && validFontName(family, "") === family && Boolean(weight) && Boolean(style);
    if (!valid) {
      if (strict) throw new AppValidationError("Enter valid local font family, file, weight, and style values.");
      continue;
    }
    if (!faces.some((face) => face.file === file && face.family === family && face.weight === weight && face.style === style)) {
      faces.push({ file, family, weight: weight!, style: style! });
    }
  }
  if (faces.length > 16) {
    if (strict) throw new AppValidationError("Use no more than 16 local font faces.");
    return faces.slice(0, 16);
  }
  return faces;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function normalizeGoogleFontsCssUrls(value: unknown): string[] {
  const source = Array.isArray(value) ? value.map(String) : String(value ?? "").split(/[|\n\r]+/);
  const urls: string[] = [];
  for (const raw of source) {
    const candidate = raw.trim();
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      if (url.protocol !== "https:" || !["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)) {
        throw new AppValidationError("Google Fonts URLs must use HTTPS and an approved Google Fonts host.");
      }
      if (candidate.length > 2_000) throw new AppValidationError("A Google Fonts URL is too long.");
      if (!urls.includes(candidate)) urls.push(candidate);
    } catch (error) {
      if (error instanceof AppValidationError) throw error;
      throw new AppValidationError("Enter valid Google Fonts CSS URLs separated by new lines or pipes.");
    }
  }
  if (urls.length > 8) throw new AppValidationError("Use no more than 8 Google Fonts CSS URLs.");
  return urls;
}

export function normalizePublicThemeSettings(value: Partial<PublicThemeSettings>, defaultGoogleFontsCssUrls: string[] = []): PublicThemeSettings {
  const defaults = defaultPublicThemeSettings(defaultGoogleFontsCssUrls);
  return {
    kitId: isPublicThemeKitId(value.kitId) ? value.kitId : defaults.kitId,
    backgroundColor: validHexColor(value.backgroundColor, defaults.backgroundColor),
    surfaceColor: validHexColor(value.surfaceColor, defaults.surfaceColor),
    textColor: validHexColor(value.textColor, defaults.textColor),
    mutedColor: validHexColor(value.mutedColor, defaults.mutedColor),
    borderColor: validHexColor(value.borderColor, defaults.borderColor),
    accentColor: validHexColor(value.accentColor, defaults.accentColor),
    bodyFont: validFontName(value.bodyFont, defaults.bodyFont),
    headingFont: validFontName(value.headingFont, defaults.headingFont),
    monoFont: validFontName(value.monoFont, defaults.monoFont),
    googleFontsCssUrls: normalizeGoogleFontsCssUrls(value.googleFontsCssUrls ?? defaults.googleFontsCssUrls),
    fontDeliveryMode: isFontDeliveryMode(value.fontDeliveryMode) ? value.fontDeliveryMode : defaults.fontDeliveryMode,
    localFontFaces: normalizeLocalFontFaces(value.localFontFaces ?? defaults.localFontFaces),
    contentWidth: Math.round(boundedNumber(value.contentWidth, defaults.contentWidth, 560, 1_200)),
    spacingUnit: Math.round(boundedNumber(value.spacingUnit, defaults.spacingUnit, 4, 16)),
    bodyFontSize: Math.round(boundedNumber(value.bodyFontSize, defaults.bodyFontSize, 14, 20)),
    lineHeight: Math.round(boundedNumber(value.lineHeight, defaults.lineHeight, 1.4, 2.2) * 10) / 10,
    cornerRadius: Math.round(boundedNumber(value.cornerRadius, defaults.cornerRadius, 0, 24)),
  };
}

export function validatePublicThemeSettings(value: Record<string, unknown>): PublicThemeSettings {
  if (!isPublicThemeKitId(value.kitId)) throw new AppValidationError("Select a valid theme starter kit.");
  const colorKeys = ["backgroundColor", "surfaceColor", "textColor", "mutedColor", "borderColor", "accentColor"] as const;
  for (const key of colorKeys) {
    if (!/^#[0-9a-f]{6}$/i.test(String(value[key] ?? ""))) throw new AppValidationError("Select valid six-digit theme colors.");
  }
  const fontKeys = ["bodyFont", "headingFont", "monoFont"] as const;
  for (const key of fontKeys) {
    const name = String(value[key] ?? "").trim();
    if (name.length < 1 || name.length > 80 || !/^[\p{L}\p{N} ._-]+$/u.test(name)) {
      throw new AppValidationError("Font family names may contain letters, numbers, spaces, dots, underscores, and hyphens.");
    }
  }
  const ranges = {
    contentWidth: [560, 1_200], spacingUnit: [4, 16], bodyFontSize: [14, 20], lineHeight: [1.4, 2.2], cornerRadius: [0, 24],
  } as const;
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const number = Number(value[key]);
    if (!Number.isFinite(number) || number < min || number > max) throw new AppValidationError("Theme sizing values are outside the allowed range.");
  }
  if (!isFontDeliveryMode(value.fontDeliveryMode)) throw new AppValidationError("Select a valid font delivery mode.");
  normalizeLocalFontFaces(value.localFontFaces, true);
  return normalizePublicThemeSettings({
    ...value,
    googleFontsCssUrls: normalizeGoogleFontsCssUrls(value.googleFontsCssUrls),
  } as Partial<PublicThemeSettings>);
}

export function publicThemeCss(theme: PublicThemeSettings) {
  const imports = theme.fontDeliveryMode === "remote" ? theme.googleFontsCssUrls.map((url) => `@import url(${JSON.stringify(url)});`).join("\n") : "";
  const format = (file: string) => file.toLowerCase().endsWith(".woff2") ? "woff2" : file.toLowerCase().endsWith(".woff") ? "woff" : file.toLowerCase().endsWith(".otf") ? "opentype" : "truetype";
  const localFaces = theme.fontDeliveryMode === "system" ? "" : theme.localFontFaces.map((face) => `@font-face { font-family: ${JSON.stringify(face.family)}; src: url(${JSON.stringify(`/assets/fonts/${encodeURIComponent(face.file)}`)}) format(${JSON.stringify(format(face.file))}); font-weight: ${face.weight}; font-style: ${face.style}; font-display: swap; }`).join("\n");
  const font = (name: string, fallback: string) => `${JSON.stringify(name)}, ${fallback}`;
  return `/* Hallmark · pre-emit critique: P4 H4 E4 S4 R5 V4 */
/* Generated by Hybrid-Static-CMS. Manage this file from the control panel. */
${imports}
${localFaces}
:root {
  --bg: ${theme.backgroundColor};
  --panel: ${theme.surfaceColor};
  --ink: ${theme.textColor};
  --ink-secondary: ${theme.mutedColor};
  --ink-muted: ${theme.mutedColor};
  --muted: ${theme.mutedColor};
  --line: ${theme.borderColor};
  --line-light: color-mix(in srgb, ${theme.borderColor} 50%, transparent);
  --accent: ${theme.accentColor};
  --accent-hover: color-mix(in srgb, ${theme.accentColor} 82%, black);
  --accent-light: color-mix(in srgb, ${theme.accentColor} 10%, transparent);
  --accent-border: color-mix(in srgb, ${theme.accentColor} 28%, transparent);
  --on-ink: ${theme.backgroundColor};
  --font-sans: ${font(theme.bodyFont, "sans-serif")};
  --font-heading: ${font(theme.headingFont, "serif")};
  --font-mono: ${font(theme.monoFont, "monospace")};
  --content-width: ${theme.contentWidth}px;
  --space-unit: ${theme.spacingUnit}px;
  --body-size: ${theme.bodyFontSize}px;
  --body-leading: ${theme.lineHeight};
  --radius-theme: ${theme.cornerRadius}px;
  --radius-sm: var(--radius-theme);
  --radius-md: calc(var(--radius-theme) + 4px);
  --theme-kit: ${JSON.stringify(theme.kitId)};
}
html, body { overflow-x: clip; }
body { background: var(--bg); color: var(--ink); font-family: var(--font-sans); font-size: var(--body-size); line-height: var(--body-leading); }
main.magazine-shell { max-width: var(--content-width); }
h1, h2, h3, h4, .magazine-masthead__name, .magazine-page-header__title, .magazine-card__title, .magazine-prose__title { font-family: var(--font-heading); font-style: normal; overflow-wrap: anywhere; min-width: 0; }
code, pre, kbd, samp { font-family: var(--font-mono); }
.magazine-page-header, .magazine-prose__header { margin-block: calc(var(--space-unit) * 5) calc(var(--space-unit) * 4); }
.hybrid-static-cms-form { display: grid; gap: calc(var(--space-unit) * 2); font-family: var(--font-sans); }
.hybrid-static-cms-form label { display: grid; gap: var(--space-unit); }
.hybrid-static-cms-form input, .hybrid-static-cms-form textarea, .hybrid-static-cms-form select { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-theme); color: var(--ink); font: inherit; padding: calc(var(--space-unit) * 1.5); width: 100%; }
.hybrid-static-cms-form button { background: var(--ink); border: 0; border-radius: var(--radius-theme); color: var(--on-ink); cursor: pointer; font: inherit; justify-self: start; padding: calc(var(--space-unit) * 1.25) calc(var(--space-unit) * 2.25); }
.hybrid-static-cms-menu ul { display: flex; flex-wrap: wrap; gap: calc(var(--space-unit) * 2); list-style: none; margin: 0; padding: 0; }
.hybrid-static-cms-menu a, .magazine-prose__body a { color: var(--accent-hover); }
.hsc-layout-block { margin-block: calc(var(--space-unit) * 4); min-width: 0; }
.hsc-layout-block > :first-child { margin-top: 0; }
.hsc-layout-block > :last-child { margin-bottom: 0; }
.hsc-layout-block--feature { background: var(--panel); border-block: 1px solid var(--line); padding: clamp(calc(var(--space-unit) * 4), 7vw, calc(var(--space-unit) * 9)) clamp(calc(var(--space-unit) * 2), 6vw, calc(var(--space-unit) * 7)); text-align: center; }
.hsc-layout-block--feature > * { margin-inline: auto; max-width: 52rem; }
.hsc-layout-block--split { display: grid; gap: calc(var(--space-unit) * 4); grid-template-columns: repeat(2, minmax(0, 1fr)); }
.hsc-layout-block--grid { display: grid; gap: calc(var(--space-unit) * 2); grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr)); }
.hsc-layout-block--grid > * { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-theme); margin: 0; min-width: 0; padding: calc(var(--space-unit) * 2); }
.hsc-layout-block--notice { background: var(--accent-light); border-left: 3px solid var(--accent); padding: calc(var(--space-unit) * 2) calc(var(--space-unit) * 2.5); }
@media (max-width: 620px) { .hsc-layout-block--split { grid-template-columns: minmax(0, 1fr); } }
${publicThemeKitCss(theme.kitId)}
`;
}

export async function ensureDefaultSettings() {
  await sql`
    insert into settings (key, value)
    values
      ('site_tagline', 'A coexistence CMS for existing sites'),
      (${postPermalinkSettingKey}, 'post_name')
    on conflict (key) do nothing
  `;
}

export async function getSetting(key: string) {
  const rows = await sql`select value from settings where key = ${key} limit 1`;
  return rows[0] ? String(rows[0].value) : null;
}

export async function setSetting(key: string, value: string) {
  await sql`
    insert into settings (key, value) values (${key}, ${value})
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
}

export async function getPostPermalinkPattern(): Promise<PostPermalinkPattern> {
  const value = await getSetting(postPermalinkSettingKey);
  return value && isPostPermalinkPattern(value) ? value : "post_name";
}

export async function setPostPermalinkPattern(pattern: PostPermalinkPattern) {
  await setSetting(postPermalinkSettingKey, pattern);
}

export async function getPublicThemeSettings(defaultGoogleFontsCssUrls: string[] = []) {
  const stored = await getSetting(publicThemeSettingKey);
  if (!stored) return defaultPublicThemeSettings(defaultGoogleFontsCssUrls);
  try {
    return normalizePublicThemeSettings(JSON.parse(stored) as Partial<PublicThemeSettings>, defaultGoogleFontsCssUrls);
  } catch {
    return defaultPublicThemeSettings(defaultGoogleFontsCssUrls);
  }
}

export async function setPublicThemeSettings(theme: PublicThemeSettings) {
  const normalized = normalizePublicThemeSettings(theme);
  await setSetting(publicThemeSettingKey, JSON.stringify(normalized));
  return normalized;
}
