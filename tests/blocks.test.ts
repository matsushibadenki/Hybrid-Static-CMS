import { describe, expect, test } from "bun:test";
import { contentBlockLayouts, isContentBlockLayout, renderContentBlock } from "../src/core/blocks";
import { defaultPublicThemeSettings, publicThemeCss } from "../src/core/settings";
import { blockPreviewScript } from "../src/core/blockPreview";

describe("visual content block layouts", () => {
  test("defines a unique allowlist and rejects arbitrary layout values", () => {
    expect(new Set(contentBlockLayouts.map((layout) => layout.id)).size).toBe(contentBlockLayouts.length);
    expect(contentBlockLayouts.map((layout) => layout.id)).toEqual(["plain", "feature", "split", "grid", "notice"]);
    expect(isContentBlockLayout("split")).toBe(true);
    expect(isContentBlockLayout("custom-class")).toBe(false);
  });

  test("wraps reusable HTML with a deterministic public layout class", () => {
    expect(renderContentBlock("notice", "<p>Important</p>")).toBe(
      '<section class="hsc-layout-block hsc-layout-block--notice" data-layout="notice"><p>Important</p></section>',
    );
    expect(renderContentBlock("plain", "<p>Existing</p>")).toBe("<p>Existing</p>");
    expect(renderContentBlock("invalid" as "plain", "<p>Safe fallback</p>")).toBe("<p>Safe fallback</p>");
  });

  test("ships responsive public CSS for every structural layout", () => {
    const css = publicThemeCss(defaultPublicThemeSettings());
    expect(css).toContain(".hsc-layout-block {");
    for (const layout of contentBlockLayouts.filter((layout) => layout.id !== "plain")) expect(css).toContain(`.hsc-layout-block--${layout.id}`);
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toContain("@media (max-width: 620px)");
    expect(css).toContain("overflow-x: clip");
  });

  test("keeps the sandboxed live-preview script syntactically valid", () => {
    const html = blockPreviewScript();
    const source = html.slice("<script>".length, -"</script>".length);
    expect(() => new Function(source)).not.toThrow();
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain("allow-scripts");
  });
});
