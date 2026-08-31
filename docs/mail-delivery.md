# Configurable Mail Delivery

## Overview

Public form notifications use one mail interface and can be delivered through
implicit-TLS SMTP, a local Sendmail-compatible MTA, or a provider-neutral HTTP
mail API. The CMS remains a Bun/Hono application, so these transports do not
require a Next.js runtime or a browser-exposed secret.

SMTP remains the default for existing installations. Existing `SMTP_FROM` and
`FORM_NOTIFICATION_EMAIL` settings continue to work without changes.

## Shared settings

```env
MAIL_DELIVERY_MODE=smtp
MAIL_FROM=cms@example.test
MAIL_TO=owner@example.test
```

`MAIL_FROM` and `MAIL_TO` override the older SMTP-specific sender and recipient
variables. When omitted, `SMTP_FROM` and `FORM_NOTIFICATION_EMAIL` are used.
Set `MAIL_DELIVERY_MODE=disabled` to store form submissions without attempting
mail delivery.

## SMTP

```env
MAIL_DELIVERY_MODE=smtp
SMTP_HOST=mail.example.test
SMTP_PORT=465
SMTP_TLS=true
SMTP_HOSTNAME=cms.example.test
SMTP_USERNAME=cms@example.test
SMTP_PASSWORD=replace-with-a-provider-password
```

SMTP uses implicit TLS by default. Use a provider endpoint that supports the
chosen TLS mode, or place a trusted relay in front of the CMS for STARTTLS-only
environments.

## Local Sendmail

```env
MAIL_DELIVERY_MODE=sendmail
MAIL_SENDMAIL_PATH=/usr/sbin/sendmail
MAIL_SENDMAIL_ARGS=-i
```

The command path must be absolute. Hybrid-Static-CMS invokes it directly, never
through a shell, and passes the sender and recipient as separate arguments.
Run the application under an operating-system account permitted to submit mail,
not as root. Monitor the MTA queue and logs separately; a successful process
exit means only that the local MTA accepted the message, not that remote
delivery succeeded.

The Docker application image does not install an MTA. Use this mode on a VPS
where an approved Sendmail-compatible binary is available, or provide a custom
image and least-privilege configuration.

## HTTP mail API

```env
MAIL_DELIVERY_MODE=http
MAIL_HTTP_API_URL=https://mail-gateway.example.test/v1/send
MAIL_HTTP_API_TOKEN=replace-with-a-secret-token
```

The endpoint receives an HTTPS `POST` with a bearer token and this JSON body:

```json
{"from":"cms@example.test","to":"owner@example.test","subject":"[Site] Contact","text":"Form: Contact\r\n..."}
```

It must return a `2xx` response after it accepts the message. HTTP is allowed
only for localhost development endpoints. Keep the token in a deployment secret
store and make the gateway validate the sender, recipient policy, request size,
and rate limits. This generic contract can be implemented by an internal mail
gateway or adapted to a provider API without changing form code.

## Failure behavior and verification

Mail failures never discard a valid form submission. They produce the existing
operator notification and audit event `form.submit.email_failed`. Test with a
non-production form first, then confirm the recipient, sender policy, and MTA
or provider logs. See [Structured logging](./structured-logging.md) for alert
delivery and [Optional Stalwart mail server](./stalwart-mail-server.md) for the
bundled SMTP option.
