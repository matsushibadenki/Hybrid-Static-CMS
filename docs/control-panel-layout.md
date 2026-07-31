# Control panel layout

The control panel automatically detects tables rendered through `adminLayout`.
Pages containing a table use the full available width with `2rem` outer padding,
and every table is placed in a horizontal scroll container.

## Table conventions

- Tables use `width: 100%`.
- Headers and ordinary cells stay on one line.
- Use `class="cell-long"` on titles, descriptions, URLs, payloads, comments, or other long text that should wrap.
- Use `class="cell-actions"` on action columns. Buttons and forms in these cells stay on one line.
- Do not add a table scroll wrapper manually. `adminLayout` adds `table-scroll` and `data-table` automatically.

These defaults apply to new control-panel tables without requiring a page-specific wide-layout option.

## Navigation conventions

- Article creation, the post list, series, categories, comments, and post permalinks belong to the article group.
- Fixed-page creation, the page list, and page groups belong to the fixed-page group.
- Forms and media are grouped as public input and asset tools.
- Menus and reusable blocks belong to site structure.
- API and plugin-provided links belong to extensions.
- AI proposal review, users, audit logs, and snapshots belong to operations.

At widths below `860px`, the navigation is collapsed behind a menu button so
the current page begins near the top of the viewport. Opening the menu preserves
the group labels instead of presenting one unstructured list.

## Form conventions

Title, slug, and parent organization belong to basic information. Body fields
remain continuously visible. Less frequently changed settings use separate
collapsed sections:

- Appearance contains page-specific stylesheets and presentation controls.
- Publication settings contain status and publication time.
- SEO settings contain search and social metadata.

Collection editors use the same section language as content editors:

- Series and page-group information appears before membership management.
- Membership controls show the parent collection, item count, insertion order, and current ordered contents separately.
- Comment policy stays with series information because it applies to the entire series.

Structured builders preserve a text-based storage format while presenting safer
controls in the browser:

- Forms expose one visual row per field, including type, required state, and select options.
- Menus expose one visual row per link, including its URL and new-tab behavior.
- Reusable blocks separate identity, body HTML, embedding instructions, and publication status.
- If JavaScript is unavailable, the original line-based definition remains available as the fallback editor.
