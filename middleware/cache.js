/**
 * Simple In-Memory Caching Middleware
 * Provides caching for frequently accessed data
 */

class SimpleCache {
    constructor() {
        this.cache = new Map();
        this.timers = new Map();
    }

    /**
     * Get cached value
     */
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        if (Date.now() > item.expiry) {
            this.delete(key);
            return null;
        }

        return item.value;
    }

    /**
     * Set cached value with TTL
     */
    set(key, value, ttlMs) {
        // Clear existing timer if any
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
        }

        this.cache.set(key, {
            value,
            expiry: Date.now() + ttlMs
        });

        // Set cleanup timer
        const timer = setTimeout(() => {
            this.delete(key);
        }, ttlMs);

        this.timers.set(key, timer);
    }

    /**
     * Delete cached value
     */
    delete(key) {
        this.cache.delete(key);
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
            this.timers.delete(key);
        }
    }

    /**
     * Clear all cached values matching a pattern
     */
    invalidate(pattern) {
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.delete(key);
            }
        }
    }

    /**
     * Clear entire cache
     */
    clear() {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.cache.clear();
        this.timers.clear();
    }

    /**
     * Get cache stats
     */
    stats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

// Create singleton instance
const cache = new SimpleCache();

// TTL constants (in milliseconds)
const TTL = {
    PRODUCTS: 5 * 60 * 1000, // 5 minutes
    CATEGORIES: 30 * 60 * 1000, // 30 minutes
    REVIEWS: 5 * 60 * 1000, // 5 minutes
    HERO_IMAGES: 10 * 60 * 1000 // 10 minutes
};

/**
 * Cache middleware factory
 */
const cacheMiddleware = (key, ttl) => {
    return (req, res, next) => {
        const cacheKey = `${key}:${req.originalUrl}`;
        const cached = cache.get(cacheKey);

        if (cached) {
            return res.json(cached);
        }

        // Store original json method
        const originalJson = res.json.bind(res);

        // Override json method to cache the response
        res.json = (data) => {
            // Only cache successful responses
            if (res.statusCode >= 200 && res.statusCode < 300) {
                cache.set(cacheKey, data, ttl);
            }
            return originalJson(data);
        };

        next();
    };
};

/**
 * Invalidate cache for a specific pattern
 */
const invalidateCache = (pattern) => {
    return (req, res, next) => {
        // Store original json method
        const originalJson = res.json.bind(res);

        res.json = (data) => {
            // Invalidate cache after successful mutation
            if (res.statusCode >= 200 && res.statusCode < 300) {
                cache.invalidate(pattern);
            }
            return originalJson(data);
        };

        next();
    };
};

module.exports = {
    cache,
    TTL,
    cacheMiddleware,
    invalidateCache
};
