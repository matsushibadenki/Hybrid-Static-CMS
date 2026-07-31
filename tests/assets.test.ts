import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import {
  ensurePublicAssetDirectories,
  listStylesheets,
  normalizeStylesheetPath,
  stylesheetPublicUrl,
} from "../src/core/assets";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("public asset directories", () => {
  test("creates the asset tree and non-destructive starter stylesheets", async () => {
    const publicHtmlDir = await mkdtemp(path.join(process.env.TMPDIR ?? "/tmp", "hybrid-static-assets-"));
    temporaryDirectories.push(publicHtmlDir);

    await ensurePublicAssetDirectories(publicHtmlDir);
    const categoryCss = path.join(publicHtmlDir, "assets", "css", "categories", "default.css");
    await writeFile(categoryCss, "/* customized */\n", "utf8");
    await ensurePublicAssetDirectories(publicHtmlDir);

    expect(await readFile(categoryCss, "utf8")).toBe("/* customized */\n");
    for (const directory of ["img", "js", "video"]) {
      expect((await stat(path.join(publicHtmlDir, "assets", directory))).isDirectory()).toBe(true);
    }
    expect(await listStylesheets("categories", publicHtmlDir)).toEqual(["categories/default.css"]);
    expect(await listStylesheets("pages", publicHtmlDir)).toEqual(["pages/default.css"]);
  });

  test("accepts scoped CSS paths and rejects traversal or cross-scope paths", () => {
    expect(normalizeStylesheetPath("categories/news.css", "categories")).toBe("categories/news.css");
    expect(stylesheetPublicUrl("pages/company.css", "pages")).toBe("/assets/css/pages/company.css");
    expect(() => normalizeStylesheetPath("../private.css", "categories")).toThrow();
    expect(() => normalizeStylesheetPath("pages/company.css", "categories")).toThrow();
    expect(() => normalizeStylesheetPath("categories/theme.js", "categories")).toThrow();
  });
});
