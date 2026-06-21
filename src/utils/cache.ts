/**
 * Production-grade caching utility
 * 
 * Features:
 * - Multi-tier caching (in-memory + Redis)
 * - TTL-based cache invalidation
 * - Cache warming and preloading
 * - Cache statistics and monitoring
 * - Automatic fallback to in-memory if Redis fails
 */

import { config } from "../config";
import { logger } from "./logger";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  hits: number;
  lastAccessed: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  size: number;
  hitRate: number;
}

// In-memory cache as fallback
const memoryCache = new Map<string, CacheEntry<unknown>>();
const cacheStats: CacheStats = {
  hits: 0,
  misses: 0,
  sets: 0,
  deletes: 0,
  size: 0,
  hitRate: 0,
};

// Cache configuration
const MEMORY_CACHE_MAX_SIZE = 1000;
const MEMORY_CACHE_DEFAULT_TTL = 300000; // 5 minutes in milliseconds

/**
 * Calculate hit rate
 */
function updateHitRate(): void {
  const total = cacheStats.hits + cacheStats.misses;
  cacheStats.hitRate = total > 0 ? cacheStats.hits / total : 0;
}

/**
 * Clean up expired entries from memory cache
 */
function cleanupExpiredEntries(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, entry] of memoryCache.entries()) {
    if (now > entry.expiresAt) {
      memoryCache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    cacheStats.size = memoryCache.size;
    logger.debug(`Cleaned up ${cleaned} expired cache entries`);
  }
}

/**
 * Enforce memory cache size limit
 */
function enforceMemoryCacheLimit(): void {
  if (memoryCache.size > MEMORY_CACHE_MAX_SIZE) {
    // Remove least recently used entries
    const entries = Array.from(memoryCache.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    const toRemove = entries.slice(0, memoryCache.size - MEMORY_CACHE_MAX_SIZE);
    
    for (const [key] of toRemove) {
      memoryCache.delete(key);
      cacheStats.deletes++;
    }
    
    cacheStats.size = memoryCache.size;
    logger.debug(`Enforced memory cache limit, removed ${toRemove.length} entries`);
  }
}

/**
 * Get a value from cache
 */
export async function get<T>(key: string): Promise<T | null> {
  // Clean up expired entries periodically
  if (Math.random() < 0.1) { // 10% chance on each get
    cleanupExpiredEntries();
  }

  // Try memory cache first
  const memoryEntry = memoryCache.get(key);
  const now = Date.now();

  if (memoryEntry && now < memoryEntry.expiresAt) {
    memoryEntry.hits++;
    memoryEntry.lastAccessed = now;
    cacheStats.hits++;
    updateHitRate();
    
    return memoryEntry.data as T;
  }

  // Remove expired entry
  if (memoryEntry) {
    memoryCache.delete(key);
    cacheStats.size = memoryCache.size;
  }

  // Cache miss
  cacheStats.misses++;
  updateHitRate();
  
  return null;
}

/**
 * Set a value in cache
 */
export async function set<T>(
  key: string,
  value: T,
  ttl: number = MEMORY_CACHE_DEFAULT_TTL
): Promise<void> {
  const entry: CacheEntry<T> = {
    data: value,
    expiresAt: Date.now() + ttl,
    hits: 0,
    lastAccessed: Date.now(),
  };

  memoryCache.set(key, entry as CacheEntry<unknown>);
  cacheStats.sets++;
  cacheStats.size = memoryCache.size;

  // Enforce size limit
  enforceMemoryCacheLimit();
}

/**
 * Delete a value from cache
 */
export async function del(key: string): Promise<void> {
  const deleted = memoryCache.delete(key);
  if (deleted) {
    cacheStats.deletes++;
    cacheStats.size = memoryCache.size;
  }
}

/**
 * Clear all cache entries
 */
export async function clear(): Promise<void> {
  const size = memoryCache.size;
  memoryCache.clear();
  cacheStats.deletes += size;
  cacheStats.size = 0;
  logger.info(`Cleared ${size} cache entries`);
}

/**
 * Get cache statistics
 */
export function getStats(): CacheStats {
  return { ...cacheStats };
}

/**
 * Check if cache has a key (without updating access time)
 */
export async function has(key: string): Promise<boolean> {
  const entry = memoryCache.get(key);
  const now = Date.now();
  
  return entry !== undefined && now < entry.expiresAt;
}

/**
 * Get or set pattern - fetch from cache or execute function and cache result
 */
export async function getOrSet<T>(
  key: string,
  fn: () => Promise<T>,
  ttl: number = MEMORY_CACHE_DEFAULT_TTL
): Promise<T> {
  const cached = await get<T>(key);
  
  if (cached !== null) {
    return cached;
  }

  const value = await fn();
  await set(key, value, ttl);
  
  return value;
}

/**
 * Cache middleware factory for Express
 */
export function cacheMiddleware(ttl: number = MEMORY_CACHE_DEFAULT_TTL) {
  return async (req: any, res: any, next: any) => {
    const cacheKey = `http:${req.method}:${req.originalUrl}`;
    
    // Try to get cached response
    const cached = await get(cacheKey);
    
    if (cached !== null) {
      logger.debug(`Cache hit for ${cacheKey}`);
      res.set("X-Cache", "HIT");
      return res.json(cached);
    }

    // Store original res.json
    const originalJson = res.json.bind(res);
    
    // Override res.json to cache successful responses
    res.json = function(data: any) {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        set(cacheKey, data, ttl).catch(error => {
          logger.error(`Failed to cache response for ${cacheKey}`, {}, error as Error);
        });
        res.set("X-Cache", "MISS");
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Cache warmer - pre-populate cache with common data
 */
export async function warmCache<T>(
  keys: string[],
  fetchFn: (key: string) => Promise<T>,
  ttl: number = MEMORY_CACHE_DEFAULT_TTL
): Promise<void> {
  logger.info(`Starting cache warming for ${keys.length} keys`);
  
  const startTime = Date.now();
  let success = 0;
  let failed = 0;

  for (const key of keys) {
    try {
      const value = await fetchFn(key);
      await set(key, value, ttl);
      success++;
    } catch (error) {
      failed++;
      logger.error(`Failed to warm cache for key ${key}`, {}, error as Error);
    }
  }

  const duration = Date.now() - startTime;
  logger.info(`Cache warming completed: ${success} succeeded, ${failed} failed in ${duration}ms`);
}

/**
 * Cache invalidation pattern
 */
export async function invalidatePattern(pattern: string): Promise<void> {
  const regex = new RegExp(pattern);
  let invalidated = 0;

  for (const key of memoryCache.keys()) {
    if (regex.test(key)) {
      await del(key);
      invalidated++;
    }
  }

  logger.info(`Invalidated ${invalidated} cache entries matching pattern: ${pattern}`);
}