/**
 * Production-grade error handling middleware
 * 
 * Features:
 * - Centralized error handling
 * - Proper error responses based on error type
 * - Request logging
 * - Request ID generation
 */

import type { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { logger, createRequestLogger, handleError, AppError, ErrorType } from "../utils/logger";

// Extend Request interface to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: number;
    }
  }
}

// Request ID middleware
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.requestId = req.headers["x-request-id"] as string || uuidv4();
  res.setHeader("X-Request-ID", req.requestId);
  next();
}

// Request logging middleware
export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.startTime = Date.now();
  
  const requestLogger = createRequestLogger(req.requestId);
  
  requestLogger.info(`${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
    query: req.query,
    userAgent: req.headers["user-agent"],
    ip: req.ip,
  });

  // Log response when finished
  res.on("finish", () => {
    const duration = Date.now() - req.startTime;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    
    if (level === "error") {
      requestLogger.error(`${req.method} ${req.path} - ${res.statusCode}`, {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
      });
    } else if (level === "warn") {
      requestLogger.warn(`${req.method} ${req.path} - ${res.statusCode}`, {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
      });
    } else {
      requestLogger.info(`${req.method} ${req.path} - ${res.statusCode}`, {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
      });
    }
    
    // Collect metrics
    try {
      // Dynamic import to avoid circular dependency
      const metrics = require("../routes/metrics");
      metrics.incrementHttpRequest(req.method, res.statusCode, duration);
    } catch (error) {
      // Silently fail if metrics module not available
    }
  });

  next();
}

// Error handling middleware
export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestLogger = createRequestLogger(req.requestId);
  const appError = handleError(err, { requestId: req.requestId, path: req.path });

  // Determine status code and message based on error type
  let statusCode = appError.statusCode;
  let message = appError.message;

  // Don't expose internal errors in production
  if (appError.type === ErrorType.INTERNAL && process.env.NODE_ENV === "production") {
    message = "Internal server error";
  }

  // Special handling for specific error types
  switch (appError.type) {
    case ErrorType.VALIDATION:
      statusCode = 400;
      break;
    case ErrorType.AUTHENTICATION:
      statusCode = 401;
      break;
    case ErrorType.AUTHORIZATION:
      statusCode = 403;
      break;
    case ErrorType.NOT_FOUND:
      statusCode = 404;
      break;
    case ErrorType.RATE_LIMIT:
      statusCode = 429;
      break;
    case ErrorType.EXTERNAL_SERVICE:
      statusCode = 503;
      break;
  }

  const response = {
    error: {
      type: appError.type,
      message,
      requestId: req.requestId,
      ...(process.env.NODE_ENV !== "production" && { stack: appError.stack }),
    },
  };

  res.status(statusCode).json(response);
}

// 404 handler
export function notFoundHandler(req: Request, res: Response): void {
  const requestLogger = createRequestLogger(req.requestId);
  
  requestLogger.warn(`Route not found: ${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
  });

  res.status(404).json({
    error: {
      type: ErrorType.NOT_FOUND,
      message: `Route ${req.method} ${req.path} not found`,
      requestId: req.requestId,
    },
  });
}

// Async wrapper for route handlers
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}