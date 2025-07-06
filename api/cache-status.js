import { getCachedData } from './cache.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { sheetId } = req.query;
        
        if (sheetId) {
            // Return cache status for specific sheet
            const cachedData = getCachedData(sheetId);
            
            if (cachedData) {
                const age = Date.now() - cachedData.timestamp;
                const lastAccessed = Date.now() - cachedData.lastAccessed;
                
                return res.status(200).json({
                    cached: true,
                    sheetId,
                    dataSize: cachedData.csvData.length,
                    hash: cachedData.hash,
                    age: {
                        created: cachedData.timestamp,
                        createdAgo: Math.round(age / 1000 / 60), // minutes
                        lastAccessed: cachedData.lastAccessed,
                        lastAccessedAgo: Math.round(lastAccessed / 1000 / 60) // minutes
                    },
                    promptTemplate: cachedData.promptTemplate ? 'cached' : 'not cached'
                });
            } else {
                return res.status(200).json({
                    cached: false,
                    sheetId,
                    message: 'No cached data found for this sheet'
                });
            }
        } else {
            // Return general cache statistics
            return res.status(200).json({
                message: 'Cache status endpoint',
                usage: 'Add ?sheetId=YOUR_SHEET_ID to get specific cache info',
                endpoints: {
                    '/api/cache-status': 'Get cache status for all sheets',
                    '/api/cache-status?sheetId=YOUR_SHEET_ID': 'Get cache status for specific sheet'
                }
            });
        }
    } catch (error) {
        console.error('Error in cache status endpoint:', error);
        return res.status(500).json({ 
            error: error.message || 'Internal server error' 
        });
    }
} 
