import { expect, test } from "bun:test";
import { fetchSearchCandidates } from "../src/core/externalSearch";

test("search adapter uses a bounded authenticated contract and deduplicates IDs", async () => {
  const fetcher = (async (_url: unknown, init: RequestInit) => {
    expect(init.redirect).toBe("error");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer secret");
    expect(JSON.parse(String(init.body))).toEqual({ version: 1, query: "東京", limit: 20, status: "published" });
    return Response.json({ items: [{ type: "post", id: 1 }, { type: "post", id: 1 }, { type: "page", id: 1 }] });
  }) as typeof fetch;
  expect(await fetchSearchCandidates("東京", 20, "https://search.example.test", "secret", fetcher)).toHaveLength(2);
});

test("search adapter rejects insecure endpoints and invalid or oversized responses", async () => {
  await expect(fetchSearchCandidates("x", 20, "http://example.test", "secret")).rejects.toThrow();
  for (const body of [JSON.stringify({ items: [{ type: "user", id: 1 }] }), JSON.stringify({ items: [{ type: "post", id: -1 }] }), "a".repeat(65537)]) {
    const fetcher = (async () => new Response(body)) as unknown as typeof fetch;
    await expect(fetchSearchCandidates("x", 20, "https://search.example.test", "secret", fetcher)).rejects.toThrow();
  }
});
