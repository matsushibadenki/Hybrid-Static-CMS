# Post permalinks

Hybrid-Static-CMS can generate published article pages with one of four permalink structures. Owners and administrators can change the structure from **Control panel > Site structure > Permalinks**.

| Setting | Example |
| --- | --- |
| Post name | `/cms/posts/sample-article.html` |
| Year and month | `/cms/posts/2026/07/sample-article.html` |
| Category and post name | `/cms/posts/category/news/sample-article.html` |
| Numeric ID | `/cms/posts/123.html` |

`Post name` is the default and preserves the URL format used by earlier Hybrid-Static-CMS releases. The category structure uses the alphabetically first assigned category and falls back to `uncategorized`. The year and month structure uses the publication date in UTC. The numeric structure remains stable when an article slug changes.

## What changes

Saving the setting regenerates all published article files and updates article cards, series navigation, canonical metadata, RSS, `sitemap.xml`, `llms.txt`, and `cms/embed.js`. Explicit canonical URLs entered in an article's SEO settings are not overwritten.

The CMS writes a protected artifact manifest at `public_html/cms/.post-artifacts.json`. On later regeneration, only article files recorded in that manifest are removed when their generated path is no longer current. The public file server rejects hidden path segments, so the manifest cannot be downloaded through the CMS route.

When upgrading from a release without the manifest, changing away from the default structure removes the known default article paths for currently published posts. Other files in `public_html` are not removed.

## Before changing an established site

Changing a permalink can break external links and reduce accumulated search ranking unless the web server redirects old URLs. Configure permanent HTTP 301 redirects in Apache, Nginx, or the hosting control panel before changing a production site's structure. Take a backup and verify representative article, series, RSS, sitemap, and embedded-list links after regeneration.

If regeneration fails while saving, the control panel restores the previous setting and attempts to regenerate the previous structure.
