export class AppValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppValidationError";
  }
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function requireNonEmpty(value: string, label: string) {
  if (!value.trim()) {
    throw new AppValidationError(`${label} is required.`);
  }
}

export function validateSlug(slug: string, label = "Slug") {
  if (!slug.trim()) {
    throw new AppValidationError(`${label} is required.`);
  }

  if (!slugPattern.test(slug)) {
    throw new AppValidationError(
      `${label} must use lowercase letters, numbers, and single hyphens only.`,
    );
  }
}

export function validateScheduledState(status: string, publishedAt?: string | null) {
  if (status === "scheduled" && !String(publishedAt ?? "").trim()) {
    throw new AppValidationError("Scheduled content requires a publish date.");
  }
}

export function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code?: string }).code) === "23505"
  );
}
