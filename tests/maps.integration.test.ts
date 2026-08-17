import path from "node:path";
import { describe, expect, test } from "bun:test";
import { createUser } from "../src/core/auth";
import { config } from "../src/core/config";
import { sql } from "../src/core/db";
import { createMap, deleteMap, expandPublishedMaps, getPublishedMapBySlug } from "../src/core/maps";
import { renderPublishedArtifacts } from "../src/core/renderer";
import { createApp } from "../src/server/app";

describe.skipIf(process.env.RUN_DB_INTEGRATION_TESTS !== "true")("managed maps integration", () => {
  test("publishes shortcode definitions into the public HTML/PHP loader", async () => {
    const suffix = crypto.randomUUID();
    const slug = `map-${suffix}`;
    let userId: number | null = null;
    let mapId: number | null = null;
    try {
      userId = await createUser({ email: `map-${suffix}@example.test`, password: "integration-password-123", displayName: "Map Editor", roles: ["editor"] });
      const map = await createMap({
        title: "Integration route", slug, provider: "openstreetmap", displayMode: "route",
        startLat: 35.681236, startLng: 139.767125, startLabel: "Tokyo Station",
        endLat: 35.658034, endLng: 139.701636, endLabel: "Shibuya Station",
        travelMode: "driving", zoom: 13, height: 420, status: "published",
      }, userId);
      mapId = map?.id ?? null;
      if (!mapId) throw new Error("Map fixture creation failed.");

      expect((await getPublishedMapBySlug(slug))?.displayMode).toBe("route");
      const apiResponse = await createApp().request(`http://localhost/cms-api/maps/${slug}`);
      const publicMap = await apiResponse.json() as Record<string, unknown>;
      expect(apiResponse.status).toBe(200);
      expect(publicMap.createdBy).toBeUndefined();
      const expanded = await expandPublishedMaps(`<p>Before</p>[[map:${slug}]]<p>After</p>`);
      expect(expanded).toContain(`data-hsc-map="${slug}"`);
      expect(expanded).toContain('<script src="/cms/maps.js" defer></script>');

      await renderPublishedArtifacts();
      const loader = await Bun.file(path.join(config.cmsOutputDir, "maps.js")).text();
      expect(loader).toContain(slug);
      expect(loader).not.toContain("Map Editor");
    } finally {
      if (mapId) await deleteMap(mapId);
      if (userId) await sql`delete from users where id = ${userId}`;
      await renderPublishedArtifacts().catch(() => undefined);
    }
  });
});
