import { MiddlewareHandler } from "hono";

/**
 * Cache middleware for public GET endpoints.
 * Sets Cache-Control headers for Cloudflare edge caching.
 *
 * @param maxAge - Cache duration in seconds (default: 5 minutes)
 * @returns MiddlewareHandler
 */
export const cachePublic = (maxAge: number = 300): MiddlewareHandler => {
  return async (c, next) => {
    // Only cache GET requests
    if (c.req.method !== "GET") {
      return next();
    }

    await next();

    // If a session was detected, don't cache on edge (prevent private data leaks)
    const decodedToken = c.get("decodedToken");
    if (decodedToken) {
      c.header("Cache-Control", "no-store, no-cache, must-revalidate");
      return;
    }

    // Set cache headers for successful responses
    const status = c.res.status;
    if (status >= 200 && status < 300) {
      c.header("Cache-Control", `public, max-age=${maxAge}`);
      c.header("CDN-Cache-Control", `public, max-age=${maxAge}`);
      c.header("Cloudflare-CDN-Cache-Control", `public, max-age=${maxAge}`);
    }
  };
};

/**
 * Short cache for frequently changing data (1 minute)
 */
export const cacheShort = cachePublic(60);

/**
 * Medium cache for semi-static data (5 minutes)
 */
export const cacheMedium = cachePublic(300);

/**
 * Long cache for static data (1 hour)
 */
export const cacheLong = cachePublic(3600);
