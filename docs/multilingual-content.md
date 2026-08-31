# Multilingual Content

## Overview

Hybrid-Static-CMS supports English (`en`), Japanese (`ja`), and Simplified
Chinese (`zh`) as independent versions of posts and fixed pages. A translation
is normal CMS content: it has its own draft, review state, publication date,
SEO settings, revisions, and comments policy.

Existing content is migrated as English. Its existing generated URLs remain
unchanged.

## Public URLs

The English locale preserves the original CMS paths:

```txt
/cms/posts/example.html
/cms/pages/about.html
```

Japanese and Simplified Chinese content is generated in locale directories:

```txt
/cms/ja/posts/example.html
/cms/ja/pages/about.html
/cms/zh/posts/example.html
/cms/zh/pages/about.html
```

Post indexes, paginated lists, RSS feeds, and page indexes are generated in
each locale directory as well. The global sitemap includes every published,
indexable locale URL. Generated labels, dates, comment forms, and the footer
use the language of each rendered page instead of the server's default locale.

## Editorial workflow

1. Create or open a post or fixed page.
2. Choose its content language in **Basic information**.
3. Save the source content.
4. In the **Translations** section, select the missing language to create a
   linked draft.
5. Translate, review, and publish the new draft independently.

Linked translations share a private translation-group identifier. The control
panel shows all available languages in one place, and generated pages emit
`hreflang` alternate links when two or more published translations exist.
For custom `templates/page.html` files, add `{{alternates}}` in the document
head to choose the placement. If it is omitted, Hybrid-Static-CMS safely adds
the links before `</head>`.

The same slug may be used once per language. For example, English and Japanese
versions of `about` are allowed because their final paths are different.

## API

Public post and page endpoints accept a `locale` query parameter:

```txt
GET /cms-api/posts?locale=ja
GET /cms-api/posts/about?locale=ja
GET /cms-api/pages?locale=zh
GET /cms-api/pages/about?locale=zh
```

When omitted, API reads continue to use English for backward compatibility.
Create and update requests may include `locale` (`en`, `ja`, or `zh`) and
`translationGroup`. Most users should create linked drafts through the control
panel instead of manually managing the group identifier.

## Upgrade and verification

Run migrations after upgrading:

```bash
bun run migrate
```

Then regenerate public files from the control panel or with the existing
regeneration workflow. Verify one Japanese draft and one published translation:

1. Confirm `/cms/ja/posts/...` or `/cms/ja/pages/...` exists.
2. Confirm its HTML root uses `lang="ja"`.
3. Publish a second language and confirm `hreflang` links reference both URLs.
4. Confirm the locale-filtered API returns only the requested language.

Translation links do not automatically translate text. They preserve editorial
ownership and allow each language to follow its own review and publication
schedule.
