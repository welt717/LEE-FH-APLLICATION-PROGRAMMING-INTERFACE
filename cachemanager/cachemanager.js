// utils/deceasedCacheManager.js
// CommonJS style so you can require() it easily
const NodeCache = require('node-cache');

// single global cache instance (1 hour TTL default)
const CACHE_TTL_SECONDS = 3600;
const cache = new NodeCache({ stdTTL: CACHE_TTL_SECONDS, checkperiod: 120 });

// The top-level key that stores a JS object mapping deceased_id -> deceasedData
const ALL_DECEASED_KEY = 'deceased:all';

/**
 * Ensure the internal map exists and return it.
 * Map is plain object: { [deceased_id]: {...} }
 */
function _ensureMap() {
  let map = cache.get(ALL_DECEASED_KEY);
  if (!map || typeof map !== 'object') {
    map = {};
    cache.set(ALL_DECEASED_KEY, map, CACHE_TTL_SECONDS);
  }
  return map;
}

/** Get a single deceased entry from the global map. Returns null if missing. */
function getDeceasedCached(deceasedId) {
  try {
    const map = _ensureMap();
    const entry = map[deceasedId] || null;
    return entry;
  } catch (err) {
    console.error('getDeceasedCached error:', err);
    return null;
  }
}

/** Set (replace) a single deceased entry in the global map */
function setDeceasedCached(deceasedId, data) {
  try {
    const map = _ensureMap();
    map[deceasedId] = data;
    cache.set(ALL_DECEASED_KEY, map, CACHE_TTL_SECONDS);
    // return the new entry
    return map[deceasedId];
  } catch (err) {
    console.error('setDeceasedCached error:', err);
    return null;
  }
}

/** Merge partial data into existing deceased cache entry (shallow merge). Creates entry if none. */
function mergeDeceasedCached(deceasedId, partial) {
  try {
    const map = _ensureMap();
    const existing = map[deceasedId] || {};
    // shallow merge — you can make deep merge if desired
    const merged = { ...existing, ...partial };
    map[deceasedId] = merged;
    cache.set(ALL_DECEASED_KEY, map, CACHE_TTL_SECONDS);
    return merged;
  } catch (err) {
    console.error('mergeDeceasedCached error:', err);
    return null;
  }
}

/** Delete a single deceased entry from the global map */
function deleteDeceasedCached(deceasedId) {
  try {
    const map = _ensureMap();
    if (map.hasOwnProperty(deceasedId)) {
      delete map[deceasedId];
      cache.set(ALL_DECEASED_KEY, map, CACHE_TTL_SECONDS);
    }
  } catch (err) {
    console.error('deleteDeceasedCached error:', err);
  }
}

/** Get all cached deceased (returns object map) */
function getAllDeceasedCached() {
  try {
    return _ensureMap();
  } catch (err) {
    console.error('getAllDeceasedCached error:', err);
    return {};
  }
}

/** Replace the whole map (useful for full refresh). */
function setAllDeceasedCached(newMap) {
  try {
    cache.set(ALL_DECEASED_KEY, newMap || {}, CACHE_TTL_SECONDS);
  } catch (err) {
    console.error('setAllDeceasedCached error:', err);
  }
}

/**
 * Refresh the whole deceased cache by calling a fetchAllFn that returns
 * an array of deceased objects (each MUST have deceased_id property).
 *
 * Example fetchAllFn: async () => (await safeQuery('SELECT ...'))
 */
async function refreshAllDeceasedCache(fetchAllFn) {
  try {
    if (typeof fetchAllFn !== 'function') {
      throw new Error('refreshAllDeceasedCache requires a fetchAllFn function');
    }
    const rows = await fetchAllFn();
    const map = {};
    if (Array.isArray(rows)) {
      for (const r of rows) {
        const id = r.deceased_id || r.deceasedId || r.id;
        if (!id) continue;
        map[id] = r;
      }
    }
    setAllDeceasedCached(map);
    console.log(
      '♻️ Refreshed all deceased cache, entries:',
      Object.keys(map).length,
    );
    return map;
  } catch (err) {
    console.error('refreshAllDeceasedCache error:', err);
    return null;
  }
}

/** For debug: clear entire cache */
function clearAllCache() {
  try {
    cache.flushAll();
    console.log('🧼 Cleared entire cache');
  } catch (err) {
    console.error('clearAllCache error:', err);
  }
}

module.exports = {
  getDeceasedCached,
  setDeceasedCached,
  mergeDeceasedCached,
  deleteDeceasedCached,
  getAllDeceasedCached,
  setAllDeceasedCached,
  refreshAllDeceasedCache,
  clearAllCache,
};
