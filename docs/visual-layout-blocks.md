# Visual Layout Blocks

Reusable blocks can apply a responsive visual structure without storing
arbitrary layout classes. Open **Site structure > Blocks**, create or edit a
block, and choose its layout before publishing it.

## Available layouts

- **Plain** keeps the block in the surrounding article flow.
- **Feature** centers and emphasizes one message with generous spacing.
- **Split** arranges direct child elements in two columns and collapses to one
  column at `620px`.
- **Grid** arranges direct child elements as responsive cards using automatic
  column fitting.
- **Notice** separates supporting or important information with an accent rule.

The order of the HTML remains the reading and keyboard order at every width.
For Split and Grid, wrap each intended column or card in a direct child element:

```html
<div>
  <h3>First section</h3>
  <p>First section content.</p>
</div>
<div>
  <h3>Second section</h3>
  <p>Second section content.</p>
</div>
```

Use the existing `[[block:slug]]` shortcode in a CMS-managed post or fixed page.
Published output for Feature, Split, Grid, and Notice wraps the sanitized body
in a deterministic structure:

```html
<section class="hsc-layout-block hsc-layout-block--split" data-layout="split">
  <!-- sanitized block body -->
</section>
```

The generated `/cms/theme.css` contains the responsive layout rules. Project
stylesheets loaded afterward can refine these public classes.

Plain intentionally emits the sanitized body without a new wrapper. This keeps
existing block output visually backward compatible after migration.

## Responsive preview

The block editor shows Desktop, Tablet, and Mobile widths beside the HTML field
on wide screens and below it on smaller screens. Formatting-toolbar changes are
detected automatically. The preview is directional; inspect a generated page
before deploying substantial project CSS overrides.

Unsaved HTML is rendered in a sandboxed iframe. Scripts, form submission,
external requests, navigation, and external media are disabled. This prevents
the preview from becoming an execution path for HTML that has not yet passed
the server sanitizer.

## API and permissions

The published blocks API includes `layoutType` with the sanitized `bodyHtml`.
Headless clients can use the same `hsc-layout-block--{layoutType}` class contract
or map the allowlisted value to their own components. Never treat `layoutType`
as an unrestricted CSS class.

The existing `blocks.read`, `blocks.write`, and `blocks.delete` permissions
continue to apply. No new role capability is introduced.

## Upgrade behavior

Run `bun run migrate` after upgrading. Migration
`031_content_block_layouts.sql` adds an allowlisted `layout_type` column.
Existing blocks receive `plain`, preserving their content and shortcode. A
filesystem backup is not required for the column itself, but normal PostgreSQL
backup policy still applies before migration.
