import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// Cache storage - in production, you might want to use Redis or a database
const cache = new Map();

// Cache file path for persistence
const CACHE_FILE = path.join(process.cwd(), '.cache', 'sheets-cache.json');

// Ensure cache directory exists
async function ensureCacheDir() {
    try {
        await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    } catch (error) {
        // Directory might already exist
    }
}

// Generate hash for data change detection
function generateHash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

// Load cache from file
async function loadCache() {
    try {
        await ensureCacheDir();
        const cacheData = await fs.readFile(CACHE_FILE, 'utf8');
        const parsed = JSON.parse(cacheData);
        
        // Convert back to Map
        cache.clear();
        for (const [key, value] of Object.entries(parsed)) {
            cache.set(key, value);
        }
        
        console.log('Cache loaded from file');
    } catch (error) {
        console.log('No existing cache found, starting fresh');
    }
}

// Save cache to file
async function saveCache() {
    try {
        await ensureCacheDir();
        const cacheData = JSON.stringify(Object.fromEntries(cache));
        await fs.writeFile(CACHE_FILE, cacheData);
        console.log('Cache saved to file');
    } catch (error) {
        console.error('Failed to save cache:', error);
    }
}

// Get cached data for a sheet
function getCachedData(sheetId) {
    return cache.get(sheetId);
}

// Set cached data for a sheet
async function setCachedData(sheetId, csvData, promptTemplate) {
    const hash = generateHash(csvData);
    const cachedData = {
        csvData,
        promptTemplate,
        hash,
        timestamp: Date.now(),
        lastAccessed: Date.now()
    };
    
    cache.set(sheetId, cachedData);
    await saveCache();
    return cachedData;
}

// Check if data has changed
function hasDataChanged(sheetId, newCsvData) {
    const cached = cache.get(sheetId);
    if (!cached) return true;
    
    const newHash = generateHash(newCsvData);
    return cached.hash !== newHash;
}

// Update last accessed time
function updateLastAccessed(sheetId) {
    const cached = cache.get(sheetId);
    if (cached) {
        cached.lastAccessed = Date.now();
    }
}

// Clean old cache entries (older than 24 hours)
async function cleanOldCache() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [sheetId, data] of cache.entries()) {
        if (now - data.lastAccessed > maxAge) {
            cache.delete(sheetId);
        }
    }
    
    await saveCache();
}

// Initialize cache on module load
loadCache();

// Clean cache periodically (every hour)
setInterval(cleanOldCache, 60 * 60 * 1000);

export {
    getCachedData,
    setCachedData,
    hasDataChanged,
    updateLastAccessed,
    cleanOldCache
}; 
