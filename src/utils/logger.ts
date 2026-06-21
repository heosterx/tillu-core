/**
 * logger.ts — Structured logger for Tillu-Core.
 *
 * Prefixes every log with [ServiceName] and ISO timestamp.
 * In production (Render), logs go to stdout which Render captures.
 * Levels: debug (dev only), info, warn, error.
 */

const IS_PROD = process.env.NODE_ENV === "production";

function ts(): string {
  return new Date().toISOString();
}

function fmt(level: string, service: string, msg: string, data?: unknown): string {
  const base = `[${ts()}] [${level}] [${service}] ${msg}`;
  if (data !== undefined) {
    const extra = typeof data === "string" ? data : JSON.stringify(data);
    return `${base} ${extra}`;
  }
  return base;
}

export function createLogger(service: string) {
  return {
    debug(msg: string, data?: unknown): void {
      if (!IS_PROD) console.debug(fmt("DEBUG", service, msg, data));
    },
    info(msg: string, data?: unknown): void {
      console.log(fmt("INFO", service, msg, data));
    },
    warn(msg: string, data?: unknown): void {
      console.warn(fmt("WARN", service, msg, data));
    },
    error(msg: string, data?: unknown): void {
      console.error(fmt("ERROR", service, msg, data));
    },
  };
}

export type Logger = ReturnType<typeof createLogger>;
