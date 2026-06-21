/**
 * Security middleware for production deployments
 * 
 * Features:
 * - Rate limiting (in-memory, suitable for single-instance deployments)
 * - Request size validation
 * - API key authentication (optional)
 * - Security headers
 * - IP-based filtering
 */

import type { Request, Response, NextFunction } from "express";
import { config } from "../config";
import { logger, AppError, ErrorType } from "../utils/logger";

// ─── Rate Limiting ─────────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!config.security.enableRateLimit) {
    return next();
  }

  const identifier = getRateLimitIdentifier(req);
  const now = Date.now();
  const windowMs = config.server.rateLimitWindowMs;
  const maxRequests = config.server.rateLimitMaxRequests;

  // Clean up old entries
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
    }
  }

  // Get or create rate limit entry
  let entry = rateLimitStore.get(identifier);
  
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 1,
      resetTime: now + windowMs,
    };
    rateLimitStore.set(identifier, entry);
  } else {
    entry.count++;
  }

  // Set rate limit headers
  const remaining = Math.max(0, maxRequests - entry.count);
  const resetTime = Math.ceil(entry.resetTime / 1000);
  
  res.setHeader("X-RateLimit-Limit", maxRequests.toString());
  res.setHeader("X-RateLimit-Remaining", remaining.toString());
  res.setHeader("X-RateLimit-Reset", resetTime.toString());

  // Check if rate limit exceeded
  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
    res.setHeader("Retry-After", retryAfter.toString());
    
    logger.warn(`Rate limit exceeded`, {
      identifier,
      count: entry.count,
      max: maxRequests,
    });

    throw new AppError(
      "Rate limit exceeded. Please try again later.",
      ErrorType.RATE_LIMIT,
      429
    );
  }

  next();
}

function getRateLimitIdentifier(req: Request): string {
  // Use user ID if authenticated, otherwise IP
  if (req.headers["x-user-id"]) {
    return `user:${req.headers["x-user-id"]}`;
  }
  
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  return `ip:${ip}`;
}

// ─── Security Headers ───────────────────────────────────────────────────────────

export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Basic security headers
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  
  // Remove X-Powered-By header
  res.removeHeader("X-Powered-By");
  
  // Content Security Policy (basic)
  if (config.env === "production") {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';"
    );
  }
  
  next();
}

// ─── API Key Authentication ─────────────────────────────────────────────────────

export function apiKeyAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const apiKey = config.security.apiKey;
  
  // Skip if no API key configured
  if (!apiKey) {
    return next();
  }

  // Check for API key in header or query parameter
  const providedKey = req.headers["x-api-key"] as string || req.query.api_key as string;
  
  if (!providedKey) {
    throw new AppError(
      "API key required",
      ErrorType.AUTHENTICATION,
      401
    );
  }

  if (providedKey !== apiKey) {
    logger.warn(`Invalid API key attempt`, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    throw new AppError(
      "Invalid API key",
      ErrorType.AUTHENTICATION,
      401
    );
  }

  next();
}

// ─── Request Size Validation ───────────────────────────────────────────────────

export function requestSizeMiddleware(req: Request, res: Response, next: NextFunction): void {
  const contentLength = req.headers["content-length"];
  const maxSize = config.server.maxPayloadSize;

  if (contentLength && parseInt(contentLength, 10) > maxSize) {
    throw new AppError(
      `Request body too large. Maximum size is ${maxSize} bytes.`,
      ErrorType.VALIDATION,
      413
    );
  }

  next();
}

// ─── IP Whitelist/Blacklist ────────────────────────────────────────────────────

const IP_WHITELIST = process.env.IP_WHITELIST?.split(",").map(ip => ip.trim()) || [];
const IP_BLACKLIST = process.env.IP_BLACKLIST?.split(",").map(ip => ip.trim()) || [];

export function ipFilterMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.connection.remoteAddress || "unknown";
  
  // Check blacklist first
  if (IP_BLACKLIST.length > 0 && IP_BLACKLIST.includes(ip)) {
    logger.warn(`Blocked request from blacklisted IP`, { ip });
    
    throw new AppError(
      "Access denied",
      ErrorType.AUTHORIZATION,
      403
    );
  }
  
  // Check whitelist if configured
  if (IP_WHITELIST.length > 0 && !IP_WHITELIST.includes(ip)) {
    logger.warn(`Blocked request from non-whitelisted IP`, { ip });
    
    throw new AppError(
      "Access denied",
      ErrorType.AUTHORIZATION,
      403
    );
  }
  
  next();
}

// ─── Request Sanitization ──────────────────────────────────────────────────────

export function sanitizationMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Remove potential script injections from query parameters
  if (req.query) {
    sanitizeObject(req.query);
  }
  
  // Remove potential script injections from request body
  if (req.body) {
    sanitizeObject(req.body);
  }
  
  next();
}

function sanitizeObject(obj: Record<string, unknown>): void {
  for (const key in obj) {
    if (typeof obj[key] === "string") {
      // Basic script tag removal
      obj[key] = (obj[key] as string)
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
        .replace(/javascript:/gi, "");
    } else if (typeof obj[key] === "object" && obj[key] !== null) {
      sanitizeObject(obj[key] as Record<string, unknown>);
    }
  }
}

// ─── Request Timeout ───────────────────────────────────────────────────────────

export function requestTimeoutMiddleware(timeoutMs: number = 30000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        logger.warn(`Request timeout`, {
          method: req.method,
          path: req.path,
          duration: timeoutMs,
        });
        
        res.status(504).json({
          error: {
            type: ErrorType.INTERNAL,
            message: "Request timeout",
            requestId: req.requestId,
          },
        });
      }
    }, timeoutMs);

    res.on("finish", () => {
      clearTimeout(timeout);
    });

    next();
  };
}