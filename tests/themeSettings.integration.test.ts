import path from "node:path";
import { describe, expect, test } from "bun:test";
import { config } from "../src/core/config";
import { renderPublishedArtifacts } from "../src/core/renderer";
import { getPublicThemeSettings, setPublicThemeSettings } from "../src/core/settings";
import { themeSettingsForKit } from "../src/core/themeKits";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("public theme settings integration", () => {
  test("persists theme tokens and links generated pages to the theme stylesheet", async () => {
    const previous = await getPublicThemeSettings(config.googleFontsCssUrls);
    try {
      await setPublicThemeSettings({ ...previous, accentColor: "#123456", contentWidth: 910, googleFontsCssUrls: [] });
      await renderPublishedArtifacts();
      const css = await Bun.file(path.join(config.cmsOutputDir, "theme.css")).text();
      const html = await Bun.file(path.join(config.cmsOutputDir, "posts", "list.html")).text();
      expect(css).toContain("--accent: #123456");
      expect(css).toContain("--content-width: 910px");
      expect(css).not.toContain("@import url(");
      expect(html).toContain('href="/cms/theme.css"');
      expect(html.indexOf("</style>")).toBeLessThan(html.indexOf('href="/cms/theme.css"'));

      await setPublicThemeSettings({ ...previous, fontDeliveryMode: "local", localFontFaces: [{ file: "integration.woff2", family: "Integration Local", weight: "100 900", style: "normal" }] });
      await renderPublishedArtifacts();
      const localCss = await Bun.file(path.join(config.cmsOutputDir, "theme.css")).text();
      expect(localCss).not.toContain("@import url(");
      expect(localCss).toContain('@font-face { font-family: "Integration Local"');
      expect(localCss).toContain('/assets/fonts/integration.woff2');

      await setPublicThemeSettings(themeSettingsForKit("technical", previous.googleFontsCssUrls, { fontDeliveryMode: previous.fontDeliveryMode, localFontFaces: previous.localFontFaces }));
      await renderPublishedArtifacts();
      const starterCss = await Bun.file(path.join(config.cmsOutputDir, "theme.css")).text();
      expect(starterCss).toContain('--theme-kit: "technical"');
      expect(starterCss).toContain("font-family: var(--font-mono)");
    } finally {
      await setPublicThemeSettings(previous);
      await renderPublishedArtifacts().catch(() => undefined);
    }
  });
});
