import type { FontDeliveryMode, LocalFontFace, PublicThemeSettings } from "./settings";

export const publicThemeKitIds = ["editorial", "studio", "journal", "technical"] as const;
export type PublicThemeKitId = (typeof publicThemeKitIds)[number];

export interface PublicThemeKit {
  id: PublicThemeKitId;
  name: string;
  description: string;
  bestFor: string;
  swatches: readonly [string, string, string];
}

export const publicThemeKits: readonly PublicThemeKit[] = [
  { id: "editorial", name: "Editorial", description: "Quiet serif hierarchy with generous reading rhythm.", bestFor: "Articles and publications", swatches: ["#ffffff", "#333333", "#41c9b4"] },
  { id: "studio", name: "Studio", description: "Sharp grid, compact spacing, and a confident sans-serif voice.", bestFor: "Portfolios and agencies", swatches: ["#f7f7f3", "#181818", "#175cd3"] },
  { id: "journal", name: "Journal", description: "Warm paper tones and literary typography for long-form work.", bestFor: "Essays and cultural sites", swatches: ["#f5f0e6", "#2f2923", "#a23b2a"] },
  { id: "technical", name: "Technical", description: "Dense documentation rhythm with monospace landmarks.", bestFor: "Documentation and products", swatches: ["#f4f7f8", "#172126", "#087f8c"] },
];

export function isPublicThemeKitId(value: unknown): value is PublicThemeKitId {
  return publicThemeKitIds.includes(value as PublicThemeKitId);
}

export function themeSettingsForKit(id: PublicThemeKitId, googleFontsCssUrls: string[] = [], fontSettings: { fontDeliveryMode?: FontDeliveryMode; localFontFaces?: LocalFontFace[] } = {}): PublicThemeSettings {
  const shared = { googleFontsCssUrls: [...googleFontsCssUrls], fontDeliveryMode: fontSettings.fontDeliveryMode ?? "remote", localFontFaces: fontSettings.localFontFaces?.map((face) => ({ ...face })) ?? [], kitId: id };
  switch (id) {
    case "studio": return { ...shared, backgroundColor: "#f7f7f3", surfaceColor: "#ffffff", textColor: "#181818", mutedColor: "#64645f", borderColor: "#d8d8d0", accentColor: "#175cd3", bodyFont: "Google Sans Flex", headingFont: "Google Sans Flex", monoFont: "Noto Sans Mono", contentWidth: 1040, spacingUnit: 7, bodyFontSize: 16, lineHeight: 1.6, cornerRadius: 0 };
    case "journal": return { ...shared, backgroundColor: "#f5f0e6", surfaceColor: "#fffdf8", textColor: "#2f2923", mutedColor: "#746a5f", borderColor: "#d8cdbd", accentColor: "#a23b2a", bodyFont: "Noto Serif JP", headingFont: "Noto Serif JP", monoFont: "Noto Sans Mono", contentWidth: 720, spacingUnit: 9, bodyFontSize: 17, lineHeight: 2, cornerRadius: 0 };
    case "technical": return { ...shared, backgroundColor: "#f4f7f8", surfaceColor: "#ffffff", textColor: "#172126", mutedColor: "#5f6d73", borderColor: "#cbd5d9", accentColor: "#087f8c", bodyFont: "Noto Sans JP", headingFont: "Noto Sans Mono", monoFont: "Noto Sans Mono", contentWidth: 960, spacingUnit: 6, bodyFontSize: 15, lineHeight: 1.7, cornerRadius: 2 };
    default: return { ...shared, backgroundColor: "#ffffff", surfaceColor: "#ffffff", textColor: "#333333", mutedColor: "#777777", borderColor: "#ebebeb", accentColor: "#41c9b4", bodyFont: "Noto Sans JP", headingFont: "Noto Serif JP", monoFont: "Noto Sans Mono", contentWidth: 780, spacingUnit: 8, bodyFontSize: 16, lineHeight: 1.8, cornerRadius: 6 };
  }
}

export function publicThemeKitCss(id: PublicThemeKitId) {
  switch (id) {
    case "studio": return `
.magazine-masthead { border-bottom-width: 2px; }
.magazine-page-header__eyebrow, .magazine-kicker { border: 1px solid var(--accent-border); border-radius: 0; background: transparent; }
.magazine-index { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: calc(var(--space-unit) * 5); }
.magazine-card--lead { grid-column: 1 / -1; }
.magazine-card__read { text-transform: uppercase; letter-spacing: .06em; }
@media (max-width: 620px) { .magazine-index { grid-template-columns: minmax(0, 1fr); } .magazine-card--lead { grid-column: auto; } }
`;
    case "journal": return `
.magazine-masthead { border-bottom: 0; border-top: 3px double var(--line); margin-top: calc(var(--space-unit) * 2); }
.magazine-page-header__eyebrow, .magazine-kicker { background: transparent; border-radius: 0; border-bottom: 1px solid var(--accent); padding-inline: 0; }
.magazine-card { padding-block: calc(var(--space-unit) * 3); }
.magazine-card__title, .magazine-prose__title { letter-spacing: -.025em; }
.magazine-prose__body p { text-wrap: pretty; }
`;
    case "technical": return `
.magazine-masthead, .magazine-card, .series-pager, .post-comments { border-color: var(--line); }
.magazine-page-header__eyebrow, .magazine-kicker, .magazine-card__meta, .magazine-footer { font-family: var(--font-mono); letter-spacing: .04em; }
.magazine-page-header__eyebrow, .magazine-kicker { border-radius: 0; border: 1px solid var(--line); background: var(--panel); }
.magazine-card { border-bottom-style: dashed; }
.magazine-card__read::before { content: "[ "; }.magazine-card__read::after { content: " ]"; }
`;
    default: return `
.magazine-prose__body { text-wrap: pretty; }
`;
  }
}
