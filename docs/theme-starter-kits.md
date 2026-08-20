# Theme Starter Kits

Hybrid-Static-CMS includes four reusable visual starting points for generated
posts, fixed pages, indexes, and forms. Owners and administrators can open
**Site structure > Theme settings** and apply a kit from the starter library.
Applying a kit regenerates public output immediately.

## Included kits

- **Editorial** uses a quiet reading width, serif headings, and generous rhythm
  for articles and publications.
- **Studio** uses a sharp grid, compact spacing, and sans-serif typography for
  portfolios and agency sites.
- **Journal** uses warm paper tones and literary typography for essays and
  cultural sites.
- **Technical** uses dense spacing and monospace landmarks for documentation
  and product sites.

Applying a kit replaces the shared colors, fonts, dimensions, and structural
kit CSS. Existing Google Fonts CSS URLs are preserved. Individual controls below
the starter library remain editable after applying a kit. Manual changes retain
the selected kit's structural CSS.

## Reusable HTML templates

Matching template shells are available under `templates/starters`:

```text
templates/starters/editorial.html
templates/starters/studio.html
templates/starters/journal.html
templates/starters/technical.html
```

Back up an existing `templates/page.html` before replacing it. For example:

```sh
cp templates/page.html templates/page.html.backup
cp templates/starters/studio.html templates/page.html
```

If `templates/page.html` does not exist, only the second command is needed.
Regenerate public output after changing the template. The template shell and
selected settings kit are independent, so they can also be combined deliberately.

## Template placeholders

- `{{lang}}`, `{{siteName}}`, `{{siteUrl}}`, and `{{year}}` provide site context.
- `{{title}}` and the SEO placeholders provide page metadata.
- `{{theme}}` loads generated theme tokens and kit rules.
- `{{stylesheets}}` loads category or fixed-page stylesheets.
- `{{body}}` inserts the generated page content.

Keep `{{theme}}` before `/assets/css/site.css` and `{{stylesheets}}` so project
CSS remains the final authority. The supplied templates use generated CSS
variables for theme-dependent colors, spacing, typography, and dimensions.

## Permissions and recovery

Starter application uses the existing `settings.manage` permission and writes
an audit event. If regeneration fails, the previous PostgreSQL setting is
restored and the CMS attempts to regenerate the previous output. No database
migration is required. Backups should include PostgreSQL, `templates`, and
`public_html/assets` before substantial customization.
