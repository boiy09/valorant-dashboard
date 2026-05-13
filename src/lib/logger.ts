type LogLevel = "info" | "warn" | "error";

function fmt(level: LogLevel, tag: string, message: string, extra?: unknown) {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] [${tag}] ${message}`;
  if (extra !== undefined) {
    const detail = extra instanceof Error ? extra.stack ?? extra.message : JSON.stringify(extra);
    return `${base}\n  ${detail}`;
  }
  return base;
}

export const logger = {
  info(tag: string, message: string, extra?: unknown) {
    console.log(fmt("info", tag, message, extra));
  },
  warn(tag: string, message: string, extra?: unknown) {
    console.warn(fmt("warn", tag, message, extra));
  },
  error(tag: string, message: string, extra?: unknown) {
    console.error(fmt("error", tag, message, extra));
    // TODO: Sentry 연동 시 여기에 captureException 추가
    // if (process.env.SENTRY_DSN) Sentry.captureException(extra ?? new Error(message));
  },
};
