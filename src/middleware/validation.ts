/**
 * Request validation middleware using Zod
 * 
 * Features:
 * - Schema validation for request bodies and query parameters
 * - Type-safe validation with detailed error messages
 * - Automatic sanitization of validated data
 */

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { AppError, ErrorType } from "../utils/logger";

/**
 * Validate request body against a Zod schema
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validatedData = schema.parse(req.body);
      req.body = validatedData; // Replace with validated data
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorDetails = error.errors.map(err => ({
          field: err.path.join("."),
          message: err.message,
          code: err.code,
        }));

        throw new AppError(
          "Validation failed",
          ErrorType.VALIDATION,
          400,
          { validationErrors: errorDetails }
        );
      }
      
      throw new AppError(
        "Validation error",
        ErrorType.VALIDATION,
        400
      );
    }
  };
}

/**
 * Validate request query parameters against a Zod schema
 */
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validatedData = schema.parse(req.query);
      req.query = validatedData as unknown as Record<string, string>; // Replace with validated data
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorDetails = error.errors.map(err => ({
          field: err.path.join("."),
          message: err.message,
          code: err.code,
        }));

        throw new AppError(
          "Query parameter validation failed",
          ErrorType.VALIDATION,
          400,
          { validationErrors: errorDetails }
        );
      }
      
      throw new AppError(
        "Query parameter validation error",
        ErrorType.VALIDATION,
        400
      );
    }
  };
}

/**
 * Validate request parameters against a Zod schema
 */
export function validateParams<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validatedData = schema.parse(req.params);
      req.params = validatedData as unknown as Record<string, string>; // Replace with validated data
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorDetails = error.errors.map(err => ({
          field: err.path.join("."),
          message: err.message,
          code: err.code,
        }));

        throw new AppError(
          "Parameter validation failed",
          ErrorType.VALIDATION,
          400,
          { validationErrors: errorDetails }
        );
      }
      
      throw new AppError(
        "Parameter validation error",
        ErrorType.VALIDATION,
        400
      );
    }
  };
}

// ─── Common Validation Schemas ─────────────────────────────────────────────────

export const commonSchemas = {
  // UUID validation
  uuid: z.string().uuid(),
  
  // User ID validation
  userId: z.string().min(1).max(100),
  
  // Session ID validation
  sessionId: z.string().min(1).max(100),
  
  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
  
  // Date range
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }),
  
  // Sort options
  sort: z.object({
    field: z.string().optional(),
    order: z.enum(["asc", "desc"]).default("desc"),
  }),
};

// ─── Response Sanitization ──────────────────────────────────────────────────────

/**
 * Sanitize response data by removing sensitive fields
 */
export function sanitizeResponse<T>(
  data: T,
  sensitiveFields: string[] = ["password", "token", "apiKey", "secret"]
): T {
  if (typeof data !== "object" || data === null) {
    return data;
  }

  const sanitized = { ...data };

  for (const field of sensitiveFields) {
    if (field in sanitized) {
      (sanitized as Record<string, unknown>)[field] = "[REDACTED]";
    }
  }

  // Recursively sanitize nested objects
  for (const key in sanitized) {
    const value = (sanitized as Record<string, unknown>)[key];
    if (typeof value === "object" && value !== null) {
      (sanitized as Record<string, unknown>)[key] = sanitizeResponse(value, sensitiveFields);
    }
  }

  return sanitized;
}

/**
 * Sanitize error responses to avoid leaking sensitive information
 */
export function sanitizeErrorResponse(error: Error): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    // Only include stack trace in development
    ...(process.env.NODE_ENV !== "production" && { stack: error.stack }),
  };
}

// ─── Content Type Validation ──────────────────────────────────────────────────

/**
 * Validate request content type
 */
export function validateContentType(contentType: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.is(contentType)) {
      throw new AppError(
        `Content-Type must be ${contentType}`,
        ErrorType.VALIDATION,
        415
      );
    }
    next();
  };
}