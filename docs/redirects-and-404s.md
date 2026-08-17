# Redirects and 404 reporting

Hybrid-Static-CMS can preserve established URLs after content changes and report
missing public paths. Open **Site structure > Redirects and 404s** at
`/control-panel/redirects`.

## Redirect manager

Create a rule with:

- **Source path**: an internal path such as `/old-page.html`; queries and fragments are not accepted
- **Target location**: an internal path or an external `https://` URL
- **Status code**: `301`, `302`, `307`, or `308`
- **Enabled**: controls whether the rule is included in public output
- **Note**: optional operational context

Use `301` for a permanent URL change that may change a request into `GET`. Use
`308` for a permanent change that must preserve the HTTP method. `302` and `307`
are temporary equivalents. Public pages are served with `GET`, so `301` is the
normal choice for article and fixed-page moves.

The validator blocks control-panel, API, login, setup, health, and preview paths.
It also rejects insecure external HTTP targets, self-redirects, and detected
redirect loops. Editing an automatically generated rule converts it into a manual
rule so later content changes do not silently overwrite the operator's decision.

## Automatic URL preservation

Permanent redirects are generated when:

- a published post changes its slug, category-scoped path, or another component of the selected permalink structure
- a published fixed page changes its slug
- the global post permalink structure changes

Older automatic chains are updated to point directly to the newest URL. If a
previously published item is changed into a draft, its new automatic redirect is
kept disabled until that destination is published again. Manual rules always take
precedence over automatic updates.

## Public redirect manifest

Enabled rules are compiled atomically to:

```text
public_html/cms/redirects.json
```

The Bun public-file route reads this generated file and does not query PostgreSQL
for every successful page or asset request. Redirect hit counters are updated in
the background and never delay the redirect response.

If Nginx, Apache, Caddy, or a CDN serves `public_html` directly without forwarding
the request through Bun, the application cannot issue the redirect or collect a
404 report. In that deployment model, convert `redirects.json` into the web
server's rewrite format during deployment, or route unresolved public requests
through Hybrid-Static-CMS. Do not expose the control panel merely to enable public
redirects.

## 404 report

When the Bun public-file route cannot find a requested file, it aggregates the
missing path in PostgreSQL. The report stores only:

- normalized request path without its query string
- aggregate hit count
- first and last seen timestamps
- the latest referrer **origin**, such as `https://example.com`

Visitor IP addresses, query values, full referrer paths, cookies, and user-agent
strings are not stored. Application-internal paths such as the control panel, API,
health endpoints, and preview URLs are excluded. Unique reports are capped at
10,000 rows to limit unbounded bot-generated path growth.

From a report row, enter a replacement target and select **Create redirect**. The
redirect is created and that report is removed. Administrators can dismiss an
individual report or clear all reports. Editors can inspect reports and create or
update redirects but cannot delete rules or clear report history.

## Verification

1. Create an enabled rule from `/redirect-test-old.html` to an existing page.
2. Request the source URL without signing in.
3. Confirm an HTTP `301` response and the expected `Location` header.
4. Request a nonexistent public path and reload the 404 report page.
5. Confirm the aggregate count increases without storing a visitor IP or complete referrer URL.
6. Change a published post slug and confirm an automatic rule appears for its old generated URL.

Run migrations before using this feature. Migration
`029_redirects_and_404_reports.sql` creates the redirect and aggregate-report
tables. Regenerating public output also rebuilds the redirect manifest.
