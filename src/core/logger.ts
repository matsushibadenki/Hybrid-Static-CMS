import { config } from "./config";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogContext = Record<string, unknown>;

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const sensitiveKey = /(authorization|cookie|csrf|password|passwd|secret|token|api[-_]?key|session)/i;

export function logLevelEnabled(level: LogLevel, minimum: LogLevel) {
  return levelPriority[level] >= levelPriority[minimum];
}

function sanitizeString(value: string) {
  return value
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^:/@\s]+):[^/@\s]+@/gi, "$1:[REDACTED]@")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/=._~-]+/gi, "$1 [REDACTED]")
    .replace(/([?&](?:token|secret|password|api[_-]?key)=)[^&#\s]+/gi, "$1[REDACTED]")
    .slice(0, 4_000);
}

function sanitizeValue(value: unknown, key: string, depth: number, seen: WeakSet<object>): unknown {
  if (sensitiveKey.test(key)) return "[REDACTED]";
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return sanitizeString(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      stack: value.stack ? sanitizeString(value.stack) : undefined,
    };
  }
  if (typeof value !== "object") return sanitizeString(String(value));
  if (depth >= 5) return "[MAX_DEPTH]";
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item, index) => sanitizeValue(item, String(index), depth + 1, seen));
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 100)
      .map(([childKey, childValue]) => [childKey, sanitizeValue(childValue, childKey, depth + 1, seen)]),
  );
}

export function sanitizeLogContext(context: LogContext = {}) {
  return sanitizeValue(context, "context", 0, new WeakSet<object>()) as LogContext;
}

export function createLogRecord(
  level: LogLevel,
  event: string,
  message: string,
  context: LogContext = {},
  timestamp = new Date(),
) {
  return {
    timestamp: timestamp.toISOString(),
    level,
    service: config.appName,
    event: sanitizeString(event),
    message: sanitizeString(message),
    context: sanitizeLogContext(context),
  };
}

export function writeLog(level: LogLevel, event: string, message: string, context: LogContext = {}) {
  if (!logLevelEnabled(level, config.logLevel)) return;
  const record = createLogRecord(level, event, message, context);
  const output = config.logFormat === "json"
    ? JSON.stringify(record)
    : `${record.timestamp} ${level.toUpperCase()} ${record.event}: ${record.message}${Object.keys(record.context).length ? ` ${JSON.stringify(record.context)}` : ""}`;
  const writer = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  writer(output);
}

export const logDebug = (event: string, message: string, context?: LogContext) => writeLog("debug", event, message, context);
export const logInfo = (event: string, message: string, context?: LogContext) => writeLog("info", event, message, context);
export const logWarn = (event: string, message: string, context?: LogContext) => writeLog("warn", event, message, context);
export const logError = (event: string, message: string, context?: LogContext) => writeLog("error", event, message, context);
