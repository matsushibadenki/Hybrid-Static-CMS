# Multilingual Content Search

Hybrid-Static-CMS can search posts and fixed pages in English, Japanese, and
Simplified Chinese without an external search service. Open **Content search**
under **Site structure** in the control panel to search both content types and
inspect index health.

## Search behavior

- PostgreSQL stores a lowercase NFKC-normalized search document made from the
  title, excerpt, and Markdown-like body.
- Full-width and half-width Latin characters are treated consistently. For
  example, `ＡＢＣ` can be found with `abc`.
- Every whitespace-separated term must occur in the content. One- and two-
  character Japanese terms therefore work without a morphological tokenizer.
- Exact and partial title matches receive a relevance boost. Remaining results
  are ranked with PostgreSQL `pg_trgm` similarity and then by update time.
- Search input is limited to 200 Unicode characters and eight terms. Values are
  always passed to PostgreSQL as parameters; SQL wildcard characters in input
  are escaped.

This design is suitable for small and medium installations. A one-character
search may require a sequential scan because a trigram index cannot represent
it. Large installations should use a planned external search adapter when more
advanced tokenization, typo tolerance, or distributed indexing is required.

## Control panel and permissions

Editors, administrators, and owners have `search.read` and can search drafts,
scheduled content, and published content. Only administrators and owners have
`search.manage`; this permission displays **Rebuild search indexes**. Rebuilding
uses `REINDEX INDEX CONCURRENTLY`, so ordinary searches remain available.

Search queries are not recorded by this feature. The index contains content
already stored in PostgreSQL and is not exposed as a downloadable file.

## Public API

The existing endpoint remains backward compatible and searches posts by
default:

```text
GET /cms-api/search?q=東京
```

Select fixed pages or a combined result set with `type`:

```text
GET /cms-api/search?type=pages&q=城市
GET /cms-api/search?type=all&q=文化&limit=20
```

Public search always limits results to published content. `type=posts` and
`type=pages` return their existing paginated list shape. `type=all` returns
`query`, `total`, and an `items` array whose records include `type`, `title`,
`slug`, `excerpt`, `status`, `updatedAt`, and `score`. The maximum limit is 100.

## Installation and upgrade

Migration `030_multilingual_search.sql` enables `pg_trgm`, adds generated
`search_text` columns, creates GIN indexes for posts and pages, and removes the
superseded English-only `search_vector` indexes and columns. Run:

```sh
bun run migrate
```

The database role running migrations must be allowed to install `pg_trgm`.
The standard PostgreSQL 18 Docker setup has this permission. On a managed
PostgreSQL service, enable the extension through the provider or ask the
database administrator before running the migration.

After upgrading, open **Content search** and confirm that the status is
**Healthy**, both indexes report healthy, and the indexed counts match the
content counts. Test a Japanese two-character term, a Simplified Chinese term,
and a full-width title searched with half-width characters.
