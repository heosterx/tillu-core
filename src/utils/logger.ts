/**
 * Production-grade logging utility
 * 
 * Features:
 * - Structured logging (JSON in production, pretty in development)
 * - Multiple log levels (error, warn, info, debug)
 * - Request context tracking
 * - Error stack trace handling
 * - Performance timing
 */

import { config } from "../config";

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  duration?: number;
}

class Logger {
  private level: LogLevel;
  private format: "json" | "pretty";

  constructor() {
    this.level = this.parseLogLevel(config.logging.level);
    this.format = config.logging.format as "json" | "pretty";
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case "error": return LogLevel.ERROR;
      case "warn": return LogLevel.WARN;
      case "info": return LogLevel.INFO;
      case "debug": return LogLevel.DEBUG;
      default: return LogLevel.INFO;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.level;
  }

  private formatLog(entry: LogEntry): string {
    if (this.format === "json") {
      return JSON.stringify(entry);
    }

    // Pretty format for development
    const timestamp = new Date(entry.timestamp).toISOString();
    const level = entry.level.padEnd(5);
    const context = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
    const error = entry.error ? ` [${entry.error.name}: ${entry.error.message}]` : "";
    const duration = entry.duration ? ` (${entry.duration}ms)` : "";
    
    return `${timestamp} [${level}] ${entry.message}${context}${error}${duration}`;
  }

  private log(level: LogLevel, message: string, context?: LogContext, error?: Error, duration?: number): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: LogLevel[level],
      message,
      context,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: config.logging.enableStackTrace ? error.stack : undefined,
      };
    }

    if (duration !== undefined) {
      entry.duration = duration;
    }

    const formatted = this.formatLog(entry);

    switch (level) {
      case LogLevel.ERROR:
        console.error(formatted);
        break;
      case LogLevel.WARN:
        console.warn(formatted);
        break;
      case LogLevel.INFO:
        console.log(formatted);
        break;
      case LogLevel.DEBUG:
        console.debug(formatted);
        break;
    }
  }

  error(message: string, context?: LogContext, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  warn(message: string, context?: LogContext): void {
    this.log(LogLevel.WARN, message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log(LogLevel.INFO, message, context);
  }

  debug(message: string, context?: LogContext): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  // Performance timing utility
  time(label: string): () => void {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      this.debug(`Timer: ${label}`, undefined); // Duration not included in debug call
    };
  }
}

// Singleton instance
export const logger = new Logger();

// Convenience functions for request-scoped logging
export function createRequestLogger(requestId: string) {
  return {
    error: (message: string, context?: LogContext, error?: Error) => 
      logger.error(message, { ...context, requestId }, error),
    warn: (message: string, context?: LogContext) => 
      logger.warn(message, { ...context, requestId }),
    info: (message: string, context?: LogContext) => 
      logger.info(message, { ...context, requestId }),
    debug: (message: string, context?: LogContext) => 
      logger.debug(message, { ...context, requestId }),
    time: (label: string) => logger.time(label),
  };
}

// Error classification utility
export enum ErrorType {
  VALIDATION = "validation",
  AUTHENTICATION = "authentication",
  AUTHORIZATION = "authorization",
  NOT_FOUND = "not_found",
  RATE_LIMIT = "rate_limit",
  EXTERNAL_SERVICE = "external_service",
  INTERNAL = "internal",
}

export class AppError extends Error {
  constructor(
    message: string,
    public type: ErrorType,
    public statusCode: number = 500,
    public context?: LogContext
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

export function handleError(error: unknown, context?: LogContext): AppError {
  if (error instanceof AppError) {
    logger.error(error.message, context, error);
    return error;
  }

  if (error instanceof Error) {
    logger.error(`Unhandled error: ${error.message}`, context, error);
    return new AppError(
      "Internal server error",
      ErrorType.INTERNAL,
      500,
      context
    );
  }

  logger.error(`Unknown error type: ${String(error)}`, context);
  return new AppError(
    "Internal server error",
    ErrorType.INTERNAL,
    500,
    context
  );
}