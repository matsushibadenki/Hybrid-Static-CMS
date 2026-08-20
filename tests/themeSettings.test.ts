import { describe, expect, test } from "bun:test";
import {
  defaultPublicThemeSettings,
  normalizeGoogleFontsCssUrls,
  normalizeLocalFontFaces,
  publicThemeCss,
  validatePublicThemeSettings,
} from "../src/core/settings";
import { publicThemeKitCss, publicThemeKits, themeSettingsForKit } from "../src/core/themeKits";

describe("public theme settings", () => {
  test("keeps commas inside Google Fonts URLs and splits only on lines or pipes", () => {
    const first = "https://fonts.googleapis.com/css2?family=Example:opsz,wght@6..144,100..900&display=swap";
    const second = "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@100..900";
    expect(normalizeGoogleFontsCssUrls(`${first}|${second}`)).toEqual([first, second]);
  });

  test("rejects unapproved font hosts and unsafe font family syntax", () => {
    expect(() => normalizeGoogleFontsCssUrls("https://example.test/font.css")).toThrow();
    expect(() => validatePublicThemeSettings({ ...defaultPublicThemeSettings(), bodyFont: "Font';color:red" })).toThrow();
  });

  test("validates theme ranges instead of silently accepting invalid form values", () => {
    expect(() => validatePublicThemeSettings({ ...defaultPublicThemeSettings(), contentWidth: 200 })).toThrow();
    expect(() => validatePublicThemeSettings({ ...defaultPublicThemeSettings(), accentColor: "red" })).toThrow();
  });

  test("renders portable CSS tokens and optional remote font imports", () => {
    const css = publicThemeCss({ ...defaultPublicThemeSettings(["https://fonts.googleapis.com/css2?family=Noto+Sans+JP"]), accentColor: "#112233", contentWidth: 920 });
    expect(css).toContain("--accent: #112233");
    expect(css).toContain("--content-width: 920px");
    expect(css).toContain("@import url(");
    expect(css).toContain("overflow-x: clip");
  });

  test("provides distinct valid starter kits without discarding Google Fonts", () => {
    const fontUrl = "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@100..900";
    expect(new Set(publicThemeKits.map((kit) => kit.id)).size).toBe(publicThemeKits.length);

    for (const kit of publicThemeKits) {
      const settings = themeSettingsForKit(kit.id, [fontUrl]);
      expect(() => validatePublicThemeSettings({ ...settings })).not.toThrow();
      expect(settings.kitId).toBe(kit.id);
      expect(settings.googleFontsCssUrls).toEqual([fontUrl]);
      expect(publicThemeCss(settings)).toContain(`--theme-kit: "${kit.id}"`);
    }
  });

  test("keeps starter layout CSS responsive and theme-token based", () => {
    const css = publicThemeKits.map((kit) => publicThemeKitCss(kit.id)).join("\n");
    expect(css).toContain("@media (max-width: 620px)");
    expect(css).toContain("var(--accent)");
    expect(css).not.toContain("/Users/");
  });

  test("ships reusable starter templates with safe portable placeholders", async () => {
    for (const kit of publicThemeKits) {
      const html = await Bun.file(new URL(`../templates/starters/${kit.id}.html`, import.meta.url)).text();
      for (const placeholder of ["{{lang}}", "{{siteName}}", "{{siteUrl}}", "{{theme}}", "{{stylesheets}}", "{{body}}"])
        expect(html).toContain(placeholder);
      expect(html.includes("@media")).toBe(kit.id === "studio" || kit.id === "technical");
      expect(html).not.toContain("/Users/");
    }
  });

  test("switches remote font requests off in privacy-first modes", () => {
    const face = { file: "example.woff2", family: "Example Sans", weight: "100 900", style: "normal" as const };
    const remote = publicThemeCss({ ...defaultPublicThemeSettings(["https://fonts.googleapis.com/css2?family=Example"]), localFontFaces: [face] });
    const local = publicThemeCss({ ...defaultPublicThemeSettings(["https://fonts.googleapis.com/css2?family=Example"]), fontDeliveryMode: "local", localFontFaces: [face] });
    const system = publicThemeCss({ ...defaultPublicThemeSettings(["https://fonts.googleapis.com/css2?family=Example"]), fontDeliveryMode: "system", localFontFaces: [face] });
    expect(remote).toContain("@import url(");
    expect(remote).toContain("@font-face");
    expect(local).not.toContain("@import url(");
    expect(local).toContain('/assets/fonts/example.woff2');
    expect(system).not.toContain("@import url(");
    expect(system).not.toContain("@font-face");
  });

  test("validates local face metadata and preserves it across starter kits", () => {
    const faces = normalizeLocalFontFaces([{ file: "variable.woff2", family: "Local Variable", weight: "100 900", style: "normal" }], true);
    expect(() => normalizeLocalFontFaces([{ file: "../font.woff2", family: "Bad", weight: "400", style: "normal" }], true)).toThrow();
    const settings = themeSettingsForKit("studio", [], { fontDeliveryMode: "local", localFontFaces: faces });
    expect(settings.fontDeliveryMode).toBe("local");
    expect(settings.localFontFaces).toEqual(faces);
  });
});
