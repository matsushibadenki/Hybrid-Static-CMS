# Public Theme Settings

Owners and administrators can open **Site structure > Theme settings** to
manage the shared appearance of generated public content. The editor provides a
live preview and stores validated values in PostgreSQL. Saving or restoring the
defaults regenerates public output immediately.

Four complete visual presets are available above the individual controls. See
[Theme starter kits](./theme-starter-kits.md) for their intended uses and the
matching reusable HTML shells.

Font file hosting and external-request policy are managed separately under
[Local fonts](./local-fonts.md). Theme family-name fields reference the family
names registered there.

## Available settings

- **Colors**: page background, surface, primary text, muted text, borders, and
  accent color. The editor accepts six-digit hexadecimal colors.
- **Typography**: body, heading, and monospace font family names, body size, and
  line height.
- **Google Fonts**: up to eight HTTPS CSS URLs hosted by
  `fonts.googleapis.com` or `fonts.gstatic.com`.
- **Layout**: public content width, the base spacing unit, and corner radius.

The control panel preview updates while values are edited. It is a compact
representation rather than a pixel-identical copy of every post layout. Use
**Save theme and regenerate** and inspect the generated post and fixed-page
indexes before deploying a major visual change.

## Google Fonts and privacy

Enter one Google Fonts CSS URL per line or separate URLs with `|`. Commas inside
variable-font axis definitions are part of the URL and are not separators.
For example:

```text
https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@100..900
https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@200..900
```

`GOOGLE_FONTS_CSS_URLS` remains the initial default for installations that have
not saved theme settings. Once a theme is saved, its PostgreSQL value takes
precedence. **Restore defaults** uses the current environment-variable value.
Leave the control-panel field empty to generate no remote font imports. This is
recommended for privacy-sensitive or offline sites; local font files can be
placed under `public_html/assets` and declared in `assets/css/site.css`.

Remote fonts cause visitors' browsers to contact Google. Review applicable
privacy and consent requirements before enabling them.

## Generated CSS and custom templates

The renderer writes the current theme atomically to:

```text
public_html/cms/theme.css
```

Generated pages load it with `/cms/theme.css`. The current template placeholder
is:

```html
{{theme}}
```

Add this placeholder before custom site and content stylesheets in
`templates/page.html`. Older templates without the placeholder remain
compatible: the renderer inserts the theme link near the start of `<head>` so
later custom CSS can override it. Category and fixed-page stylesheets continue
to load after the theme.

For hand-written HTML or PHP under `public_html`, include the stylesheet when
the page should use the CMS theme:

```html
<link rel="stylesheet" href="/cms/theme.css">
```

The generated CSS includes tokens and base styles for CMS post/page layouts,
form fragments, and menu fragments. Existing custom CSS remains the final
authority when it loads after the theme.

## Permissions, storage, and recovery

The page uses the existing `settings.manage` permission, limited to owners and
administrators. Updates are recorded in the audit log. Theme data is stored as
the `public_theme_v1` setting; it contains presentation values and public font
URLs, not credentials.

No database migration is required. If regeneration fails after saving, the CMS
restores the previous database setting and attempts to regenerate the previous
theme. PostgreSQL backups include the theme setting, while filesystem backups
should include custom templates, `public_html/assets`, and generated output as
described in the operations guide.
