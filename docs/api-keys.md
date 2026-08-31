# Scoped API Keys

## Purpose

API keys let a deployment script, headless frontend, or trusted integration call
protected `/cms-api` endpoints without sharing a browser session or a user
password. They do not change the public read APIs: published posts, pages,
menus, blocks, maps, and public forms remain available without a key where they
already were.

## Create and revoke

1. Sign in as an owner or administrator.
2. Open **Extensions → API keys** in the control panel.
3. Give the key a recognizable name, choose only the required permissions, and
   optionally set an expiration date.
4. Copy the generated value immediately. It is shown once and is never stored
   in readable form.
5. Revoke a key from the same screen when an integration is removed or a secret
   may have been exposed.

Keys are owned by the user who creates them. They inherit that user's active
role permissions and can only narrow them. For example, a key with
`posts.write` cannot publish until it also has `posts.publish`, and it stops
working if its owner is deactivated or loses the required role permission.

## Request format

Send the key in the standard HTTP authorization header. Do not place it in a
URL, query parameter, browser-visible JavaScript, or committed configuration
file.

```bash
curl -X POST https://cms.example.test/cms-api/posts \
  -H 'Authorization: Bearer hsc_exampleKeyPrefix_exampleSecret' \
  -H 'Content-Type: application/json' \
  --data '{"title":"Deployment note","slug":"deployment-note","bodyHtml":"<p>Published by an integration.</p>","status":"draft"}'
```

API-key requests to protected mutation endpoints do not need a CSRF token.
Cookie-authenticated browser requests still use the existing CSRF protections.
An invalid, expired, or revoked bearer key returns `401`; a valid key without
the required scope or owner permission returns `403`.

## Security and operations

- Store keys in the deployment platform's secret manager or environment secret
  store, never in `public_html`, client-side bundles, source control, or logs.
- Use one key per integration so a compromised integration can be revoked
  without interrupting others.
- Prefer short expirations for temporary migration or release automation.
- The database stores only a SHA-256 hash, a non-secret prefix, scopes, owner,
  timestamps, and revocation state. The original secret cannot be recovered.
- The control panel records creation and revocation in the audit log. `last used`
  is updated at most once every five minutes to avoid write load on frequent
  requests.

## Upgrade and verification

Run migrations after upgrading:

```bash
bun run migrate
```

Verify with a draft-only `posts.write` key: create a draft through the API,
confirm that publishing is rejected without `posts.publish`, revoke the key,
then confirm that the same request receives `401`.
