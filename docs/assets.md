# Public assets

Hybrid-Static-CMS reserves `public_html/assets` for frontend files used by an
existing site, generated CMS pages, or a separate headless frontend.

## Automatic directory structure

The application creates missing directories at startup and before static
artifact generation:

```txt
public_html/
  assets/
    css/
      site.css
      categories/
        default.css
      pages/
        default.css
    img/
    js/
    video/
```

Existing files are never overwritten. The setup wizard creates the same
structure in the selected `public_html` directory.

- `assets/css/site.css`: shared styles for the public site
- `assets/css/categories/*.css`: styles assigned to post categories
- `assets/css/pages/*.css`: styles selected by individual fixed pages
- `assets/img`: frontend images that are not managed by the media library
- `assets/js`: public frontend scripts
- `assets/video`: frontend video assets that are not managed by the media library

All files are publicly available below `/assets/*`. Do not place secrets,
database dumps, source maps containing private source, or unpublished material
in this directory.

## Assigning stylesheets

Open **Categories** in the article section of the control panel to assign one
file from `assets/css/categories` to each category. A post in multiple
categories loads every assigned category stylesheet once.

Open a fixed page's create or edit screen to select one file from
`assets/css/pages`. The selected file is included in previews and generated
page HTML.

Content-specific stylesheets load after the built-in public-page styles, so
they can override the default design. Invalid paths are rejected when settings
are saved and ignored defensively during rendering.

## Headless usage

```html
<link rel="stylesheet" href="/assets/css/site.css">
<script src="/assets/js/app.js" defer></script>
<img src="/assets/img/logo.svg" alt="Site name">
```

The JSON API returns `stylesheetPath` for fixed pages and
`categoryStylesheets` for posts. API clients can map these relative values to
`/assets/css/{stylesheetPath}`.

Back up the complete `public_html/assets` directory. PostgreSQL backups preserve
stylesheet selections, but do not contain the asset files.

