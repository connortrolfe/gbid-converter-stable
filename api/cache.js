import crypto from 'crypto';

// Cache storage - in-memory only for serverless compatibility
const cache = new Map();

// Generate hash for data change detection
function generateHash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

// Load cache from memory (no persistence in serverless)
async function loadCache() {
    console.log('Cache initialized in memory (serverless mode)');
}

// Save cache to memory (no persistence in serverless)
async function saveCache() {
    // In serverless environment, we can't persist to filesystem
    // Cache will be lost on cold starts, but that's acceptable for this use case
    console.log('Cache saved to memory');
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
    
    // No need to save since we're in memory-only mode
    console.log('Cache cleaned, removed old entries');
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
