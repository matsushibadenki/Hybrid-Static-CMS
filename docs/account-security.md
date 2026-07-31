# Account Security

Hybrid-Static-CMS supports password self-service, personal TOTP two-factor authentication, one-time recovery codes, and login-session management.

## Encryption key

Set a strong, installation-specific value before users enroll in two-factor authentication:

```dotenv
ACCOUNT_ENCRYPTION_KEY=replace-with-a-long-random-secret
```

Personal TOTP secrets are encrypted with AES-GCM before they are stored in PostgreSQL. Recovery codes are stored only as keyed hashes. The plaintext recovery codes are shown once after enrollment or regeneration.

`ACCOUNT_ENCRYPTION_KEY` falls back to `SESSION_SECRET` for compatibility, but production installations should configure a separate value. Back up this key securely with the database. Changing or losing it makes existing personal TOTP secrets unreadable; users must then have their personal 2FA reset and enroll again.

## Personal two-factor enrollment

Each signed-in user can open **Account security** in the control panel and:

1. Confirm the current password.
2. Add the displayed secret or setup URI to a TOTP authenticator.
3. Confirm a current six-digit code.
4. Store the eight one-time recovery codes in a password manager or protected offline location.

Enrollment expires after 15 minutes. Enabling or disabling personal 2FA signs out the user's other sessions.

At login, a user with personal 2FA must enter either a current authenticator code or an unused recovery code. A recovery code is removed atomically after successful use and cannot be reused.

## Deployment-wide compatibility mode

`TWO_FACTOR_ENABLED` and `TWO_FACTOR_SECRET` remain available for older installations that require one shared TOTP secret. A personal TOTP configuration takes precedence for that user. New installations should prefer personal enrollment and avoid distributing a shared secret.

## Passwords and sessions

The account-security screen allows a user to change their own password after confirming the current password. The current session remains active and all other sessions are revoked.

The session list shows:

- current and other active sessions
- last activity and expiry time
- recorded client IP when proxy trust is configured correctly
- the browser user-agent for non-current sessions

Users can revoke one other session or all other sessions. Session and security changes are recorded in the audit log. Session metadata is operational security data and should follow the same access and retention protections as other authentication records.

## Recovery procedure

If an authenticator is unavailable, use one of the saved recovery codes in the login form. After signing in, regenerate the recovery-code set or disable and re-enroll personal 2FA.

If all recovery codes are lost, an authorized administrator must verify the user's identity through an installation-specific process, then use **Reset two-factor authentication** on the user's edit screen. This removes personal 2FA and revokes all of that user's sessions. The user can sign in with the existing password and enroll again. Do not send TOTP secrets or recovery codes by ordinary email.
