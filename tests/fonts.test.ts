import { afterEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { deleteLocalFont, listLocalFontFiles, uploadLocalFont } from "../src/core/fonts";

const temporaryDirectories: string[] = [];
afterEach(async () => Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))));

describe("local font assets", () => {
  test("detects WOFF2 content and stores it under the public font directory", async () => {
    const root = await mkdtemp(path.join(process.env.TMPDIR ?? "/tmp", "hybrid-static-fonts-"));
    temporaryDirectories.push(root);
    const name = await uploadLocalFont(new File([new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0])], "Heading.exe"), root);
    expect(name).toMatch(/^heading-[a-f0-9]{8}\.woff2$/);
    expect(await listLocalFontFiles(root)).toEqual([expect.objectContaining({ name, format: "woff2", publicUrl: `/assets/fonts/${name}` })]);
    await deleteLocalFont(name, root);
    expect(await listLocalFontFiles(root)).toEqual([]);
  });

  test("rejects invalid font content and unsafe deletion paths", async () => {
    const root = await mkdtemp(path.join(process.env.TMPDIR ?? "/tmp", "hybrid-static-fonts-"));
    temporaryDirectories.push(root);
    await expect(uploadLocalFont(new File(["not a font"], "fake.woff2"), root)).rejects.toThrow("not a supported");
    await writeFile(path.join(root, "assets", "fonts", "bad name.woff2"), new Uint8Array([0x77, 0x4f, 0x46, 0x32]));
    expect(await listLocalFontFiles(root)).toEqual([]);
    await expect(deleteLocalFont("../private.woff2", root)).rejects.toThrow("valid local font file");
  });
});
