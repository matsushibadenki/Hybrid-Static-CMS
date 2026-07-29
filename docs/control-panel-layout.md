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
