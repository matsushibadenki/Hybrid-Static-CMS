import { describe, expect, test } from "bun:test";
import { createUser } from "../src/core/auth";
import { sql } from "../src/core/db";
import {
  createRedirect,
  deleteRedirect,
  findPublicRedirect,
  listNotFoundReports,
  recordNotFound,
  syncPostUrlRedirect,
  writePublicRedirectManifest,
} from "../src/core/redirects";
import { createApp } from "../src/server/app";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("redirect and 404 reporting integration", () => {
  test("serves generated redirects, aggregates private-safe 404 data, and avoids automatic reversion loops", async () => {
    const suffix = crypto.randomUUID();
    const manualSource = `/legacy-${suffix}.html`;
    const manualTarget = `/current-${suffix}.html`;
    const oldSlug = `old-${suffix}`;
    const newSlug = `new-${suffix}`;
    const missingPath = `/missing-${suffix}.html`;
    let userId: number | null = null;
    let manualId: number | null = null;
    try {
      userId = await createUser({ email: `redirect-${suffix}@example.test`, password: "integration-password-123", displayName: "Redirect Editor", roles: ["editor"] });
      const redirect = await createRedirect({ sourcePath: manualSource, targetLocation: manualTarget, statusCode: 301, enabled: true, note: "Migration" }, userId);
      manualId = redirect?.id ?? null;
      expect((await findPublicRedirect(manualSource))?.location).toBe(manualTarget);

      const response = await createApp().request(`http://localhost${manualSource}`);
      expect(response.status).toBe(301);
      expect(response.headers.get("location")).toBe(manualTarget);

      await recordNotFound(missingPath, "https://referrer.example/private/path?secret=yes");
      await recordNotFound(missingPath, "not-a-url");
      const report = (await listNotFoundReports(missingPath))[0];
      expect(report.requestPath).toBe(missingPath);
      expect(report.hitCount).toBe(2);
      expect(report.lastReferrerOrigin).toBe("https://referrer.example");

      const base = { id: 987654, publishedAt: "2026-08-05T00:00:00.000Z", updatedAt: "2026-08-05T00:00:00.000Z", categories: ["news"], status: "published" };
      await syncPostUrlRedirect({ ...base, slug: oldSlug }, { ...base, slug: newSlug }, "post_name", userId);
      expect((await findPublicRedirect(`/cms/posts/${oldSlug}.html`))?.location).toBe(`/cms/posts/${newSlug}.html`);
      await syncPostUrlRedirect({ ...base, slug: newSlug }, { ...base, slug: oldSlug }, "post_name", userId);
      expect(await findPublicRedirect(`/cms/posts/${oldSlug}.html`)).toBeNull();
      expect((await findPublicRedirect(`/cms/posts/${newSlug}.html`))?.location).toBe(`/cms/posts/${oldSlug}.html`);
    } finally {
      if (manualId) await deleteRedirect(manualId);
      await sql`delete from site_redirects where source_path in (${`/cms/posts/${oldSlug}.html`}, ${`/cms/posts/${newSlug}.html`})`;
      await sql`delete from not_found_reports where request_path = ${missingPath}`;
      if (userId) await sql`delete from users where id = ${userId}`;
      await writePublicRedirectManifest();
    }
  });
});
