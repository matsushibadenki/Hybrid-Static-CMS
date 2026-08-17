# Editorial review workflow

Hybrid-Static-CMS keeps editorial review state separate from publication state. A post or page can therefore remain a publication `draft`, `scheduled`, or `published` record while its editorial state moves through review.

## States

- `draft`: no review is active. Direct publishing remains available for backward-compatible, single-editor installations.
- `in_review`: an author or editor submitted the saved content for review. Publishing is blocked until the review is approved or withdrawn.
- `changes_requested`: a reviewer returned the content with a required note. Save the changes and submit it again.
- `approved`: the submitted version was approved. If review-covered fields change, the state returns to `draft` automatically.

The approval fingerprint covers the title, slug, excerpt, body, SEO fields, category/tag assignments, and the page stylesheet. Publication status and publication time are excluded, so an approved draft can be scheduled without invalidating approval.

## Permissions

- Owners, administrators, and editors can approve content and request changes.
- Authors can submit their content for review and withdraw their own active request.
- Review actions and notes are recorded in `editorial_workflow_events` and administrative audit logs.

## Control-panel workflow

1. Save the post or page before requesting review.
2. Open its edit screen and use **Submit for review** in **Editorial workflow**.
3. A reviewer selects **Approve review** or enters a reason and selects **Request changes**.
4. After approval, publish or schedule the content normally.

The post and page lists provide a separate review-state filter and column. This avoids confusing review progress with generated-page publication status.

## Upgrade note

Migration `027_editorial_workflow.sql` adds workflow columns and event history. Existing published and scheduled content is marked `approved` without an approval fingerprint, preserving its current availability. Its first content edit starts the new workflow at `draft`.
