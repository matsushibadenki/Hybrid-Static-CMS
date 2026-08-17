# Post and page import/export

Hybrid-Static-CMS provides a versioned JSON portability format for moving posts
and fixed pages between installations. Open **Operations > Import and export**
at `/control-panel/portability`.

## Export

Select **Download content archive**. The generated file contains:

- post and fixed-page titles, slugs, excerpts, Markdown, and sanitized HTML
- the source publication state and publication timestamp
- SEO metadata and indexing controls
- post categories, tags, and per-post comment policy
- series and page-group relationships represented by parent slugs
- the fixed-page stylesheet path as migration reference information

The archive deliberately excludes user IDs, names, email addresses, passwords,
sessions, personal two-factor data, comments and commenter details, media files,
form submissions, credentials, audit logs, and generated static output.

Keep exported archives private. Article bodies and SEO metadata may still contain
confidential drafts, unpublished URLs, addresses, or other non-public data.

## Import

1. Copy required media and custom files under `public_html/assets` separately.
2. Create matching series and page groups on the destination installation when
   relationships should be restored.
3. Open **Operations > Import and export**.
4. Select a Hybrid-Static-CMS JSON archive and confirm the draft-import notice.
5. Select **Validate and import**.
6. Review every imported item before publishing it.

The importer applies these safety rules:

- every item is created as a draft, regardless of its source publication state
- existing post or page slugs are skipped and never overwritten
- imported HTML passes through the current content sanitizer again
- categories and tags are recreated from safe lowercase slugs
- series and page groups are linked only when a matching parent slug exists
- missing fixed-page stylesheets are not assigned automatically
- only version `1` archives using the `hybrid-static-cms-content` format are accepted
- files are limited to 5 MB and 1,000 combined posts and pages

The import summary shows created, skipped, and warning counts. Audit logs record
who exported or imported content and the number of affected items.

## Parent collections and assets

The first format version references series and page groups but does not create or
modify those parent records. Create the destination parents with the same slugs
before importing when relationships matter. A missing parent produces a warning
and leaves the imported item ungrouped.

Media binaries, category CSS, page CSS, JavaScript, videos, and other files under
`public_html` are not embedded in the JSON archive. Move those files using a
filesystem backup or deployment process. Fixed-page stylesheet paths are exported
only to help identify assets that need to be copied and reassigned.

## Permissions

Owners, administrators, and editors can export and import content. Authors,
viewers, and AI-agent accounts cannot access the portability page. Imports use the
operator performing the action as the author of newly created drafts.

## Verification

After an import:

1. Filter the post and fixed-page lists by **Draft**.
2. Open imported content and inspect body HTML, SEO fields, categories, and tags.
3. Confirm series and page-group membership.
4. Copy and assign any referenced media or stylesheet assets.
5. Preview each item, then publish it through the normal editorial workflow.

This content archive complements, but does not replace, PostgreSQL backup and
restore. Use database backups for complete disaster recovery and the portability
archive for selective migration between installations.
