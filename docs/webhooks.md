# Outbound Webhooks

## Purpose

Outbound webhooks notify one trusted service after important CMS activity. They
are useful for cache invalidation, headless-site rebuilds, deployment records,
and external operations dashboards. They are disabled unless configured.

## Configuration

```env
OUTBOUND_WEBHOOK_URL=https://automation.example.test/hybrid-static-cms
OUTBOUND_WEBHOOK_SECRET=replace-with-a-long-random-secret
OUTBOUND_WEBHOOK_TIMEOUT_MS=5000
```

- `OUTBOUND_WEBHOOK_URL` must use HTTPS. Plain HTTP is accepted only for local
  development receivers on `localhost`, `127.0.0.1`, or `::1`.
- `OUTBOUND_WEBHOOK_SECRET` is optional but strongly recommended.
- `OUTBOUND_WEBHOOK_TIMEOUT_MS` is clamped between 500 and 30000 milliseconds.

Keep the URL and secret in the deployment secret store or `.env`; never embed
them in client-side code or files served from `public_html`.

## Events and payload

Hybrid-Static-CMS sends these event names:

- `publishing.completed` after the complete static output generation succeeds
- `content.changed` after a post or fixed-page change is audited
- `form.submitted` after a valid public form submission is stored
- `media.changed` after media is added or removed
- `backup.created` after a PostgreSQL backup file is written successfully

Each HTTP `POST` body has this compact schema:

```json
{
  "version": 1,
  "event": "content.changed",
  "action": "post.update",
  "occurredAt": "2026-08-31T00:00:00.000Z",
  "resource": { "type": "post", "id": "42" }
}
```

Form field values, visitor IP addresses, author email addresses, article/page
bodies, API keys, and local filesystem paths are never included.

## Signature verification

Requests include `Content-Type: application/json`, `X-HSCMS-Event`, and
`X-HSCMS-Timestamp`. When a secret is configured, they also include:

```txt
X-HSCMS-Signature: sha256=<hex digest>
```

Calculate HMAC-SHA-256 over this exact string and compare it in constant time:

```txt
<X-HSCMS-Timestamp>.<exact request body>
```

Reject stale timestamps at the receiving service to reduce replay risk.

## Failure behavior

Webhook delivery is asynchronous. A timeout or non-2xx response does not undo
a saved form submission, media operation, backup, or publication. Failures are
logged as `webhook.delivery_failed`; monitor these with the existing structured
logging and operator-alert facilities. Current delivery is best-effort. Use the
receiver's idempotency logic and event/action/resource fields to safely handle
retries or duplicate events.

## Verification

1. Set a localhost receiver URL during development and restart the CMS.
2. Create or update a draft post and confirm `content.changed`.
3. Regenerate public output and confirm `publishing.completed`.
4. Configure a secret and verify the signature before accepting the request.
