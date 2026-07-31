import { sql } from "./db";
import {
  decryptAccountSecret,
  encryptAccountSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashPassword,
  hashRecoveryCode,
  totpEnrollmentUri,
  verifyPassword,
  verifyTotpCode,
} from "./security";
import { AppValidationError } from "./validation";

export type AccountSession = {
  id: number;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string;
  createdIp: string | null;
  userAgent: string | null;
  current: boolean;
};

async function accountRow(userId: number) {
  const rows = await sql`
    select id, email, password_hash, totp_secret_encrypted, totp_enabled_at,
      totp_pending_secret_encrypted, totp_pending_expires_at, recovery_code_hashes
    from users
    where id = ${userId} and is_active = true
    limit 1
  `;
  return rows[0] as Record<string, unknown> | undefined;
}

async function requireCurrentPassword(userId: number, password: string) {
  const row = await accountRow(userId);
  if (!row || !(await verifyPassword(password, String(row.password_hash)))) {
    throw new AppValidationError("Current password is incorrect.");
  }
  return row;
}

export async function verifyAndConsumeSecondFactor(
  userId: number,
  encryptedSecret: string,
  recoveryHashes: readonly string[],
  submittedCode: string,
) {
  const secret = await decryptAccountSecret(encryptedSecret);
  if (secret && await verifyTotpCode(secret, submittedCode)) {
    return { ok: true, recoveryCodeUsed: false };
  }

  const recoveryHash = await hashRecoveryCode(submittedCode);
  if (!recoveryHashes.includes(recoveryHash)) return { ok: false, recoveryCodeUsed: false };
  const result = await sql`
    update users
    set recovery_code_hashes = array_remove(recovery_code_hashes, ${recoveryHash})
    where id = ${userId} and ${recoveryHash} = any(recovery_code_hashes)
  `;
  return { ok: result.count > 0, recoveryCodeUsed: result.count > 0 };
}

export async function getAccountSecurity(userId: number, currentSessionId: number) {
  const row = await accountRow(userId);
  if (!row) throw new AppValidationError("Account not found.");
  const sessions = await sql`
    select id, created_at, expires_at, last_seen_at, created_ip, user_agent
    from sessions
    where user_id = ${userId} and expires_at > now()
    order by last_seen_at desc, id desc
  `;
  return {
    twoFactorEnabled: Boolean(row.totp_secret_encrypted),
    twoFactorEnabledAt: row.totp_enabled_at ? String(row.totp_enabled_at) : null,
    recoveryCodesRemaining: Array.isArray(row.recovery_code_hashes) ? row.recovery_code_hashes.length : 0,
    sessions: sessions.map((session): AccountSession => ({
      id: Number(session.id),
      createdAt: String(session.created_at),
      expiresAt: String(session.expires_at),
      lastSeenAt: String(session.last_seen_at),
      createdIp: session.created_ip ? String(session.created_ip) : null,
      userAgent: session.user_agent ? String(session.user_agent) : null,
      current: Number(session.id) === currentSessionId,
    })),
  };
}

export async function startTotpEnrollment(userId: number, email: string, currentPassword: string) {
  const row = await requireCurrentPassword(userId, currentPassword);
  if (row.totp_secret_encrypted) throw new AppValidationError("Two-factor authentication is already enabled.");
  const secret = generateTotpSecret();
  const encrypted = await encryptAccountSecret(secret);
  await sql`
    update users
    set totp_pending_secret_encrypted = ${encrypted},
      totp_pending_expires_at = now() + interval '15 minutes'
    where id = ${userId}
  `;
  return { secret, uri: totpEnrollmentUri(secret, email) };
}

export async function getPendingTotpEnrollment(userId: number, email: string) {
  const row = await accountRow(userId);
  if (!row?.totp_pending_secret_encrypted || !row.totp_pending_expires_at) return null;
  if (new Date(String(row.totp_pending_expires_at)).getTime() <= Date.now()) return null;
  const secret = await decryptAccountSecret(String(row.totp_pending_secret_encrypted));
  return secret ? { secret, uri: totpEnrollmentUri(secret, email) } : null;
}

export async function confirmTotpEnrollment(userId: number, code: string, currentSessionId: number) {
  const row = await accountRow(userId);
  if (!row?.totp_pending_secret_encrypted || !row.totp_pending_expires_at) {
    throw new AppValidationError("Start two-factor enrollment again.");
  }
  if (new Date(String(row.totp_pending_expires_at)).getTime() <= Date.now()) {
    throw new AppValidationError("The enrollment request has expired.");
  }
  const secret = await decryptAccountSecret(String(row.totp_pending_secret_encrypted));
  if (!secret || !(await verifyTotpCode(secret, code))) {
    throw new AppValidationError("Authenticator code is invalid.");
  }
  const recoveryCodes = generateRecoveryCodes();
  const recoveryHashes = await Promise.all(recoveryCodes.map((recoveryCode) => hashRecoveryCode(recoveryCode)));
  await sql.begin(async (trx) => {
    await trx`
      update users
      set totp_secret_encrypted = ${String(row.totp_pending_secret_encrypted)},
        totp_enabled_at = now(),
        totp_pending_secret_encrypted = null,
        totp_pending_expires_at = null,
        recovery_code_hashes = ${trx.array(recoveryHashes)}
      where id = ${userId}
    `;
    await trx`delete from sessions where user_id = ${userId} and id <> ${currentSessionId}`;
  });
  return recoveryCodes;
}

export async function disableTotp(userId: number, currentPassword: string, code: string, currentSessionId: number) {
  const row = await requireCurrentPassword(userId, currentPassword);
  if (!row.totp_secret_encrypted) throw new AppValidationError("Two-factor authentication is not enabled.");
  const recoveryHashes = Array.isArray(row.recovery_code_hashes) ? row.recovery_code_hashes.map(String) : [];
  const verification = await verifyAndConsumeSecondFactor(userId, String(row.totp_secret_encrypted), recoveryHashes, code);
  if (!verification.ok) throw new AppValidationError("Authenticator or recovery code is invalid.");
  await sql.begin(async (trx) => {
    await trx`
      update users
      set totp_secret_encrypted = null, totp_enabled_at = null,
        totp_pending_secret_encrypted = null, totp_pending_expires_at = null,
        recovery_code_hashes = '{}'
      where id = ${userId}
    `;
    await trx`delete from sessions where user_id = ${userId} and id <> ${currentSessionId}`;
  });
}

export async function regenerateRecoveryCodes(userId: number, currentPassword: string, code: string) {
  const row = await requireCurrentPassword(userId, currentPassword);
  if (!row.totp_secret_encrypted) throw new AppValidationError("Two-factor authentication is not enabled.");
  const secret = await decryptAccountSecret(String(row.totp_secret_encrypted));
  if (!secret || !(await verifyTotpCode(secret, code))) throw new AppValidationError("Authenticator code is invalid.");
  const recoveryCodes = generateRecoveryCodes();
  const hashes = await Promise.all(recoveryCodes.map((recoveryCode) => hashRecoveryCode(recoveryCode)));
  await sql`update users set recovery_code_hashes = ${sql.array(hashes)} where id = ${userId}`;
  return recoveryCodes;
}

export async function changeOwnPassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
  currentSessionId: number,
) {
  await requireCurrentPassword(userId, currentPassword);
  if (newPassword.length < 12) throw new AppValidationError("Password must contain at least 12 characters.");
  const passwordHash = await hashPassword(newPassword);
  await sql.begin(async (trx) => {
    await trx`
      update users
      set password_hash = ${passwordHash}, password_changed_at = now()
      where id = ${userId}
    `;
    await trx`delete from sessions where user_id = ${userId} and id <> ${currentSessionId}`;
  });
}

export async function revokeOwnSession(userId: number, sessionId: number, currentSessionId: number) {
  if (sessionId === currentSessionId) throw new AppValidationError("Use logout to end the current session.");
  const result = await sql`delete from sessions where id = ${sessionId} and user_id = ${userId}`;
  return result.count > 0;
}

export async function revokeOtherSessions(userId: number, currentSessionId: number) {
  const result = await sql`delete from sessions where user_id = ${userId} and id <> ${currentSessionId}`;
  return result.count;
}
