export type SearchCandidate = { type: "post" | "page"; id: number };

export async function fetchSearchCandidates(query: string, limit: number, url: string, token: string, fetcher: typeof fetch = fetch): Promise<SearchCandidate[]> {
  const endpoint = new URL(url);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || !token) throw new Error("Invalid search endpoint configuration");
  const response = await fetcher(endpoint, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(3000),
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ version: 1, query, limit, status: "published" }),
  });
  if (!response.ok || !response.body) throw new Error("Search endpoint unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > 65536) { await reader.cancel(); throw new Error("Search response too large"); }
      chunks.push(item.value);
    }
  } finally { reader.releaseLock(); }
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || !Array.isArray(value.items) || value.items.length > 100) throw new Error("Invalid search response");
  const seen = new Set<string>();
  return value.items.filter((item: SearchCandidate) => {
    if (!item || !["post", "page"].includes(item.type) || !Number.isSafeInteger(item.id) || item.id < 1) throw new Error("Invalid search candidate");
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
