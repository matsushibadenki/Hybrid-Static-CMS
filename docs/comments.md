# Article Comments

Hybrid-Static-CMS provides moderated comments for published posts. Comments are stored in PostgreSQL and approved comments are written into the generated article HTML. Fixed pages do not accept comments.

## Enabling comments

Comment availability has two levels:

1. A series has an **Enable comments for this series** switch. Turning it off closes comments on every article assigned to that series.
2. Each post has a setting in **Post list**: **Inherit series setting**, **Allow comments**, or **Disallow comments**.

For posts in a series, the series switch is the upper safety control. When the series is disabled, no member accepts comments. When the series is enabled, individual posts can disallow comments. A post outside a series accepts comments only when its individual setting is **Allow comments**.

Changing either setting regenerates published artifacts. Existing approved comments remain visible when submission is closed; closing comments only removes the submission form.

## Moderation workflow

Public submissions are always stored as `pending` and are not published immediately. Users with `comments.manage` permission can open **Comments** in the control panel and:

- approve a pending comment
- filter pending and approved comments
- delete a comment

Approving or deleting a comment regenerates published article files. The commenter sees a confirmation page explaining that the comment is awaiting approval.

## Spam and privacy

Comment submissions use the same PostgreSQL-backed rate-limit window as public forms. When `RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET_KEY` are configured, comments also require a valid Google reCAPTCHA v3 token.

Names and approved comment bodies are public. Email addresses are never included in generated HTML, but they are stored in PostgreSQL for moderation and therefore appear in database backups. Treat backups as personal data, restrict access, and document an appropriate retention policy before production use.

Comment text is escaped before rendering. HTML and scripts entered by visitors are displayed as text rather than executed.

## Deployment

After upgrading an existing installation, run:

```bash
bun run migrate
```

Then use **Regenerate fragments** once and verify a representative article with comments enabled and disabled.
