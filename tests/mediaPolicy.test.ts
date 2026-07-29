import { describe, expect, test } from "bun:test";
import {
  formatByteSize,
  mediaStorageState,
  resolveMediaUploadPolicy,
  type MediaUploadPolicySettings,
} from "../src/core/media";

const MB = 1024 * 1024;

function settings(overrides: Partial<MediaUploadPolicySettings> = {}): MediaUploadPolicySettings {
  return {
    globalMaxUploadBytes: 20 * MB,
    siteQuotaBytes: 10 * 1024 * MB,
    userQuotaBytes: 512 * MB,
    allowedRoles: new Set(["owner", "admin", "editor", "author"]),
    roleQuotaBytes: {},
    roleMaxUploadBytes: {},
    ...overrides,
  };
}

describe("media upload policy", () => {
  test("blocks roles outside the configured upload allowlist", () => {
    const policy = resolveMediaUploadPolicy(["viewer"], settings());
    expect(policy.uploadAllowed).toBe(false);
  });

  test("applies role-specific storage and per-file limits", () => {
    const policy = resolveMediaUploadPolicy(["author"], settings({
      roleQuotaBytes: { author: 256 * MB },
      roleMaxUploadBytes: { author: 5 * MB },
    }));
    expect(policy.uploadAllowed).toBe(true);
    expect(policy.userQuotaBytes).toBe(256 * MB);
    expect(policy.maxUploadBytes).toBe(5 * MB);
  });

  test("uses the most permissive role while preserving the global file ceiling", () => {
    const policy = resolveMediaUploadPolicy(["author", "owner"], settings({
      roleQuotaBytes: { author: 256 * MB, owner: 0 },
      roleMaxUploadBytes: { author: 5 * MB, owner: 50 * MB },
    }));
    expect(policy.userQuotaBytes).toBe(0);
    expect(policy.maxUploadBytes).toBe(20 * MB);
  });

  test("builds bounded and unlimited storage display state", () => {
    const state = mediaStorageState({
      siteUsedBytes: 25 * MB,
      siteQuotaBytes: 100 * MB,
      userUsedBytes: 5 * MB,
      userQuotaBytes: 0,
      maxUploadBytes: 10 * MB,
      uploadAllowed: true,
    });
    expect(state.site.percentage).toBe(25);
    expect(state.site.remainingBytes).toBe(75 * MB);
    expect(state.user.percentage).toBe(0);
    expect(state.user.remainingBytes).toBeNull();
  });

  test("formats storage sizes for control-panel summaries", () => {
    expect(formatByteSize(512)).toBe("512 B");
    expect(formatByteSize(1536)).toBe("1.5 KB");
    expect(formatByteSize(20 * MB)).toBe("20 MB");
  });
});
