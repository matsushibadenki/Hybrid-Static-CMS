import { describe, expect, test } from "bun:test";
import { adminTranslations, publicTranslations } from "../src/core/i18n";
import { adminDate, adminLayout } from "../src/core/layout";

describe("internationalization", () => {
  test("keeps the public translation dictionaries structurally aligned", () => {
    const englishKeys = Object.keys(publicTranslations.en).sort();
    expect(Object.keys(publicTranslations.ja).sort()).toEqual(englishKeys);
    expect(Object.keys(publicTranslations.zh).sort()).toEqual(englishKeys);
  });

  test("covers representative control-panel workflows in both translated locales", () => {
    const required = [
      "Dashboard",
      "Basic information",
      "Save post",
      "Publish and generate page",
      "Comments",
      "Comment setting",
      "Inherit series setting",
      "Enable comments for this series",
      "Schedule timezone",
      "Enter a valid publication date and time.",
      "Only published content has a generated public page. Drafts are saved without a public file, and scheduled content is generated when it is published.",
      "Post published and generated.",
      "Page published and generated.",
      "Published pages regenerated successfully.",
      "Page generation failed. Check the application logs and output-directory permissions.",
      "Series articles",
      "Page group",
      "Upload media",
      "Storage usage",
      "Site storage",
      "Your storage",
      "Per-file limit",
      "Upload status",
      "Unlimited",
      "Upload allowed",
      "Upload blocked by role policy",
      "The site media storage quota would be exceeded.",
      "Your media storage quota would be exceeded.",
      "HTML formatting tools",
      "Text formatting",
      "Headings and structure",
      "Lists and alignment",
      "Code and notation",
      "Links and files",
      "Audit logs",
      "Confirm restore",
      "Permalinks",
      "Post permalink structure",
      "Generated page",
      "Open generated page",
      "Search title or slug",
    ];
    for (const key of required) {
      expect(adminTranslations.ja[key]).toBeTruthy();
      expect(adminTranslations.zh[key]).toBeTruthy();
    }
  });

  test("emits machine-readable dates and valid locale-switching JavaScript", () => {
    expect(adminDate("2026-07-22T01:02:03.000Z")).toContain('data-i18n-date datetime="2026-07-22T01:02:03.000Z"');
    const html = adminLayout("Dashboard", null, '<input placeholder="Search title or slug" />');
    const start = html.lastIndexOf("<script>") + "<script>".length;
    const end = html.lastIndexOf("</script>");
    expect(() => new Function(html.slice(start, end))).not.toThrow();
    expect(html).toContain("originalAttributes");
    expect(html).toContain("explicitKey");
    expect(html).toContain("Intl.DateTimeFormat");
  });

  test("enables the full-width layout explicitly or whenever a table is present", () => {
    const defaultHtml = adminLayout("Dashboard", null, "<p>Default</p>");
    const wideHtml = adminLayout("Posts", null, '<div class="content-list-page"><table class="data-table"></table></div>', "wide-list");
    const automaticTableHtml = adminLayout("Forms", null, "<table><tbody><tr><td>Form</td></tr></tbody></table>");

    expect(defaultHtml).not.toContain('class="shell-card shell-card-wide-list"');
    expect(defaultHtml).toContain(".shell:not(.shell-admin) .shell-card");
    expect(defaultHtml).toContain(".shell-admin > .shell-card");
    expect(defaultHtml).toContain("padding: 64px 48px 104px");
    expect(wideHtml).toContain('class="shell-card shell-card-wide-list"');
    expect(wideHtml).toContain("padding: 2rem");
    expect(wideHtml).toContain("white-space: nowrap");
    expect(automaticTableHtml).toContain('class="shell-card shell-card-wide-list"');
    expect(automaticTableHtml).toContain('<div class="table-scroll"><table class="data-table">');
    expect(wideHtml).not.toContain("data-table data-table");
  });
});
