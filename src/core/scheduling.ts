import { AppValidationError } from "./validation";

export function parseScheduleTimeZone(value: string | undefined) {
  const timeZone = value?.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

function localParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) throw new AppValidationError("Enter a valid publication date and time.");
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] ?? 0)];
}

function partsInTimeZone(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  return [part("year"), part("month"), part("day"), part("hour"), part("minute"), part("second")] as const;
}

export function scheduleTimestampForStorage(value: string | null | undefined, timeZone: string) {
  const input = String(value ?? "").trim();
  if (!input) return null;
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(input)) {
    const explicit = new Date(input);
    if (Number.isNaN(explicit.getTime())) throw new AppValidationError("Enter a valid publication date and time.");
    return explicit.toISOString();
  }

  const targetParts = localParts(input);
  const targetUtc = Date.UTC(targetParts[0], targetParts[1] - 1, targetParts[2], targetParts[3], targetParts[4], targetParts[5]);
  let guess = targetUtc;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = partsInTimeZone(new Date(guess), timeZone);
    const representedUtc = Date.UTC(actual[0], actual[1] - 1, actual[2], actual[3], actual[4], actual[5]);
    guess += targetUtc - representedUtc;
  }
  const result = new Date(guess);
  if (partsInTimeZone(result, timeZone).some((part, index) => part !== targetParts[index])) {
    throw new AppValidationError("The selected local time does not exist in the configured schedule timezone.");
  }
  return result.toISOString();
}

export function scheduleTimestampForInput(value: string | null | undefined, timeZone: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = partsInTimeZone(date, timeZone);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parts[0]}-${pad(parts[1])}-${pad(parts[2])}T${pad(parts[3])}:${pad(parts[4])}`;
}
