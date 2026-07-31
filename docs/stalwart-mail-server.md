# Optional Stalwart Mail Server

Hybrid-Static-CMS can use an optional Stalwart container or an external SMTP provider. Stalwart is not started by the normal Compose files and remains an opt-in infrastructure component.

## Delivery modes

Choose one mode per installation:

| Mode | Compose files | CMS SMTP configuration |
| --- | --- | --- |
| Email disabled | Base Compose file only | Leave `SMTP_HOST`, `SMTP_FROM`, or `FORM_NOTIFICATION_EMAIL` empty |
| External SMTP | Base Compose file only | Set the `SMTP_*` values supplied by the provider |
| Private Stalwart submission service | Base Compose + `docker-compose.stalwart.yml` | Set `COMPOSE_PROFILES=stalwart` and connect to the configured `STALWART_HOSTNAME` |
| Public mail server | Base Compose + both Stalwart files | Also configure public ports, DNS, TLS, and reverse DNS |

The Stalwart profile is separate from the CMS application so installations that do not use it do not download, start, or maintain the mail-server image.

## Private Stalwart setup

1. Add these values to the Git-ignored `.env`:

```dotenv
COMPOSE_PROFILES=stalwart
STALWART_IMAGE=stalwartlabs/stalwart:v0.16
STALWART_HOSTNAME=mail.example.com
STALWART_PUBLIC_URL=https://mail.example.com
STALWART_ADMIN_PORT=8080

SMTP_HOST=mail.example.com
SMTP_PORT=465
SMTP_TLS=true
SMTP_HOSTNAME=cms.example.com
SMTP_USERNAME=cms@example.com
SMTP_PASSWORD=replace-with-a-long-random-password
SMTP_FROM=cms@example.com
FORM_NOTIFICATION_EMAIL=owner@example.com
```

`SMTP_HOST` and `STALWART_HOSTNAME` must use the hostname covered by the Stalwart TLS certificate. The Stalwart Compose file gives that hostname a private Docker network alias, so the CMS reaches the container without changing the certificate name to the service name.

2. Start the CMS stack with the private Stalwart extension:

```bash
docker compose \
  -f docker-compose.production.yml \
  -f docker-compose.stalwart.yml \
  --profile stalwart \
  up -d
```

For local development, replace `docker-compose.production.yml` with `docker-compose.yml`.

3. Read the Stalwart startup output and open the setup interface through the loopback-only port:

```bash
docker compose \
  -f docker-compose.production.yml \
  -f docker-compose.stalwart.yml \
  --profile stalwart \
  logs stalwart
```

Open `http://127.0.0.1:8080` locally or use an SSH tunnel. Complete the server identity, storage, account directory, logging, domain, TLS, and DKIM setup. Create a dedicated `cms@example.com` account or application password for SMTP submission. A Stalwart management API key cannot authenticate SMTP submission.

4. Restart Stalwart after completing its setup:

```bash
docker compose \
  -f docker-compose.production.yml \
  -f docker-compose.stalwart.yml \
  --profile stalwart \
  restart stalwart
```

The CMS sender currently uses implicit TLS, so use port `465`. Do not set `SMTP_TLS=false` merely to bypass an untrusted development certificate.

## Public mail-server extension

Only add public mail ports when the installation is intended to receive mail or serve external mail clients:

```bash
docker compose \
  -f docker-compose.production.yml \
  -f docker-compose.stalwart.yml \
  -f docker-compose.stalwart-public.yml \
  --profile stalwart \
  up -d
```

The public extension publishes SMTP `25`, HTTPS/JMAP `443`, implicit-TLS submission `465`, STARTTLS submission `587`, and IMAPS `993`. Change `STALWART_BIND_ADDRESS` or the individual host-port variables when the host already uses one of these ports. Do not publish services that the installation does not need.

A production mail domain also requires:

- an `A`/`AAAA` record for the mail hostname
- `MX`, SPF, DKIM, and DMARC records
- reverse DNS/PTR configured by the VPS provider
- a trusted TLS certificate matching `STALWART_HOSTNAME`
- inbound and outbound TCP port 25 availability
- monitoring for delivery queues, rejected mail, abuse, and disk usage

When direct delivery is blocked or the VPS address has poor reputation, configure a Stalwart outbound relay route to a reputable SMTP provider instead of weakening TLS or authentication.

## Disable or remove Stalwart

1. Point the CMS to an external SMTP provider, or clear `SMTP_HOST` to disable form email.
2. Remove `stalwart` from `COMPOSE_PROFILES`.
3. Stop and remove only the optional service:

```bash
docker compose \
  -f docker-compose.production.yml \
  -f docker-compose.stalwart.yml \
  --profile stalwart \
  stop stalwart

docker compose \
  -f docker-compose.production.yml \
  -f docker-compose.stalwart.yml \
  --profile stalwart \
  rm -f stalwart
```

These commands preserve the `stalwart-config` and `stalwart-data` volumes. Do not remove those volumes until mail retention, legal, backup, and migration requirements have been reviewed.

## Backup and upgrades

Back up both named volumes independently from PostgreSQL and `public_html`. Stalwart data is not included in `bun run db:backup`.

Before changing `STALWART_IMAGE`:

1. Read the Stalwart release notes.
2. Back up `stalwart-config` and `stalwart-data`.
3. Pin a tested major/minor or full release tag rather than `latest`.
4. Upgrade Stalwart separately from the CMS and verify SMTP submission before resuming notifications.
