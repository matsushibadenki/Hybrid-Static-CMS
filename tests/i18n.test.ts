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
      "Account security",
      "Change password",
      "Two-factor authentication",
      "Authenticator or recovery code",
      "Recovery Codes",
      "Signed-in devices",
      "Current password is incorrect.",
      "Unable to enable two-factor authentication.",
      "Autosave ready",
      "Unsaved changes were found.",
      "Restore autosave",
      "Autosave failed. Your form remains open.",
      "Editorial workflow",
      "Review and approval",
      "Any review state",
      "Submit for review",
      "Approve review",
      "Request changes",
      "Withdraw review",
      "Workflow history",
      "Review requested.",
      "Maps and snippets",
      "Map provider",
      "Pinpoint marker",
      "Start and destination",
      "Shortcode and public snippet",
      "Map saved and public snippets regenerated.",
      "Content search",
      "Japanese-aware search",
      "Search results",
      "Rebuild search indexes",
      "Search indexes rebuilt.",
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
      "The media file is incomplete, malformed, or does not match its declared type.",
      "PDF files containing active content are not allowed.",
      "Dimensions",
      "Variants",
      "Original",
      "Total with variants",
      "Display",
      "Responsive",
      "The image could not be decoded or processed safely.",
      "Unused media",
      "All media",
      "Reference status",
      "No references detected.",
      "Clean up selected unused media",
      "Delete selected unused media",
      "Referenced media cannot be deleted. Remove its references first.",
      "Stylesheet",
      "Category stylesheets",
      "Save stylesheet",
      "Default site stylesheet only",
      "Select a valid stylesheet from the public assets directory.",
      "The selected stylesheet no longer exists.",
      "Forms and assets",
      "Extensions",
      "Menu",
      "Presentation",
      "Appearance",
      "Regenerate public output",
      "Form setup",
      "Form structure",
      "Add field",
      "Submission experience",
      "Menu setup",
      "Navigation structure",
      "Add menu item",
      "Block setup",
      "Block body",
      "Embed block",
      "Organization",
      "Series information",
      "Comment policy",
      "Series contents",
      "Page group information",
      "Group contents",
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
      "Import and export",
      "Export posts and pages",
      "Import posts and pages",
      "Validate and import",
      "Content import completed.",
      "Redirects and 404s",
      "Add redirect",
      "404 report",
      "Create redirect",
      "Reports contain the requested path, aggregate count, timestamps, and only the referrer origin. Visitor IP addresses and complete referrer URLs are not stored.",
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
    expect(html).toContain("window.applyAdminLocale = applyAdminLocale");
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

  test("keeps mobile navigation collapsible and groups related tools together", () => {
    const html = adminLayout("Edit Post", {
      id: 1,
      sessionId: 1,
      email: "owner@example.test",
      displayName: "Owner",
      roles: ["owner"],
      csrfToken: "test",
    }, "<p>Editor</p>");

    expect(html).toContain('class="shell-menu-toggle"');
    expect(html).toContain('aria-controls="control-panel-navigation"');
    expect(html).toContain(".shell-admin .shell-header.menu-open .shell-nav");
    expect(html).toContain("menuToggle?.addEventListener");
    expect(html.indexOf('href="/control-panel/comments"')).toBeLessThan(html.indexOf('data-i18n="Fixed pages"'));
    expect(html.indexOf('href="/control-panel/settings/permalinks"')).toBeLessThan(html.indexOf('data-i18n="Fixed pages"'));
    expect(html.indexOf('href="/control-panel/proposals"')).toBeGreaterThan(html.indexOf('data-i18n="Operations"'));
  });

  test("includes responsive patterns for collection and structured editors", () => {
    const html = adminLayout("Dashboard", null, "<p>Editor styles</p>");

    expect(html).toContain(".assignment-form");
    expect(html).toContain(".assignment-list");
    expect(html).toContain(".structured-row-menu");
    expect(html).toContain(".structured-builder.is-enhanced .structured-source");
    expect(html).toContain("counter-reset: structured-row");
    expect(html).toContain("@media (max-width: 620px)");
  });
});
