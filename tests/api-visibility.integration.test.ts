import { describe, expect, test } from "bun:test";
import { createApp } from "../src/server/app";
import { sql } from "../src/core/db";

const app = createApp();
const suffix = crypto.randomUUID();

async function requestJson(url: string) {
  const response = await app.request(url);
  return response.json() as Promise<{ items: Array<{ id: number }> }>;
}

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("public API visibility", () => {
  test("does not expose draft content when status=any is requested anonymously", async () => {
    let postId: number | null = null;
    let pageId: number | null = null;
    let formId: number | null = null;
    try {
      const postRows = await sql`
        insert into posts (title, slug, body_html, status)
        values (${`Hidden Post ${suffix}`}, ${`hidden-post-${suffix}`}, '<p>private</p>', 'draft')
        returning id
      `;
      postId = Number(postRows[0].id);
      const pageRows = await sql`
        insert into pages (title, slug, body_html, status)
        values (${`Hidden Page ${suffix}`}, ${`hidden-page-${suffix}`}, '<p>private</p>', 'draft')
        returning id
      `;
      pageId = Number(pageRows[0].id);
      const formRows = await sql`
        insert into forms (title, slug, status)
        values (${`Hidden Form ${suffix}`}, ${`hidden-form-${suffix}`}, 'draft')
        returning id
      `;
      formId = Number(formRows[0].id);

      const [posts, pages, forms] = await Promise.all([
        requestJson("http://localhost/cms-api/posts?status=any&limit=50"),
        requestJson("http://localhost/cms-api/pages?status=any&limit=50"),
        requestJson("http://localhost/cms-api/forms?status=any"),
      ]);

      expect(posts.items.some((item) => item.id === postId)).toBe(false);
      expect(pages.items.some((item) => item.id === pageId)).toBe(false);
      expect(forms.items.some((item) => item.id === formId)).toBe(false);
    } finally {
      if (postId) await sql`delete from posts where id = ${postId}`;
      if (pageId) await sql`delete from pages where id = ${pageId}`;
      if (formId) await sql`delete from forms where id = ${formId}`;
    }
  });
});
