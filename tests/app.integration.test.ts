import { afterAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createApp } from "../src/server/app";
import { config } from "../src/core/config";

const app = createApp();
const staticFixtureDirectory = path.join(config.publicHtmlDir, `static-route-${crypto.randomUUID()}`);

afterAll(async () => {
  await rm(staticFixtureDirectory, { recursive: true, force: true });
});

describe("application integration smoke tests", () => {
  test("exposes a lightweight liveness endpoint without database access", async () => {
    const response = await app.request("http://localhost/healthz");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("serves the public homepage as HTML instead of a raw source document", async () => {
    const response = await app.request("http://localhost/index.html");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await response.text()).toContain("<!doctype html>");
  });

  test("serves arbitrary HTML files and directory indexes from public_html", async () => {
    await mkdir(staticFixtureDirectory, { recursive: true });
    await writeFile(path.join(staticFixtureDirectory, "page.html"), "<!doctype html><title>Static page</title>", "utf8");
    await writeFile(path.join(staticFixtureDirectory, "index.html"), "<!doctype html><title>Directory index</title>", "utf8");
    const name = path.basename(staticFixtureDirectory);

    const page = await app.request(`http://localhost/${name}/page.html`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await page.text()).toContain("<title>Static page</title>");

    const directory = await app.request(`http://localhost/${name}/`);
    expect(directory.status).toBe(200);
    expect(directory.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await directory.text()).toContain("<title>Directory index</title>");
  });

  test("keeps dot-prefixed public_html paths private", async () => {
    const response = await app.request("http://localhost/.env");
    expect(response.status).toBe(404);
  });

  test("does not expose server-side or unknown file formats as downloads", async () => {
    await mkdir(staticFixtureDirectory, { recursive: true });
    await writeFile(path.join(staticFixtureDirectory, "secret.php"), "<?php echo 'private';", "utf8");
    const name = path.basename(staticFixtureDirectory);
    const response = await app.request(`http://localhost/${name}/secret.php`);
    expect(response.status).toBe(404);
  });

  test("protects the control panel when no session is present", async () => {
    const response = await app.request("http://localhost/control-panel");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login");
  });

  test("does not expose the media library to anonymous API clients", async () => {
    const response = await app.request("http://localhost/cms-api/media");
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});
