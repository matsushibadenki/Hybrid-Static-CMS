# Structured logging and operator alerts

Hybrid-Static-CMS writes application events through a shared logger. Production
installations should keep the default JSON format so a process manager or log
collector can parse each line without relying on human-oriented text.

## Configuration

```env
LOG_LEVEL=info
LOG_FORMAT=json
OPERATOR_ALERT_WEBHOOK_URL=https://alerts.example.com/hybrid-static-cms
OPERATOR_ALERT_WEBHOOK_SECRET=replace-with-a-random-secret
OPERATOR_ALERT_MIN_LEVEL=error
OPERATOR_ALERT_TIMEOUT_MS=5000
```

- `LOG_LEVEL` accepts `debug`, `info`, `warn`, or `error`.
- `LOG_FORMAT` accepts `json` or `text`.
- `OPERATOR_ALERT_WEBHOOK_URL` must use HTTPS. Plain HTTP is accepted only for
  localhost development receivers.
- `OPERATOR_ALERT_WEBHOOK_SECRET` is optional, but strongly recommended.
- `OPERATOR_ALERT_MIN_LEVEL` controls which operator notifications are sent.
- `OPERATOR_ALERT_TIMEOUT_MS` is clamped between 500 and 30000 milliseconds.

Do not commit webhook URLs or secrets. Store them in `.env` or the deployment
platform's secret manager.

## Webhook request

The receiver gets a JSON `POST` containing the same structured event envelope
used by the logger. Requests include:

- `Content-Type: application/json`
- `X-HSCMS-Timestamp`: the event delivery timestamp
- `X-HSCMS-Signature`: `sha256=<hex digest>` when a secret is configured

The signature input is:

```txt
<X-HSCMS-Timestamp>.<exact request body>
```

Verify it with HMAC SHA-256 and reject stale timestamps to reduce replay risk.
Compare signatures with a constant-time comparison.

## Privacy and failure behavior

Keys containing password, secret, token, API key, session, Cookie, CSRF, or
Authorization terms are replaced with `[REDACTED]`. Credentials embedded in
URLs and common authorization strings are also masked. Do not add form payloads
or other personal data to logging contexts.

Webhook failure never changes a public form result or HTTP error response.
Delivery failures are written as `operator_alert.delivery_failed` warnings.
Database-backed operator notifications remain available when no webhook is
configured. Webhook delivery runs asynchronously after the local notification is
stored, so a slow receiver does not delay login, publishing, or moderation.
