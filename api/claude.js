import { getCachedData, setCachedData, hasDataChanged, updateLastAccessed } from './cache.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { sheetId, sheetRange, materialInput } = req.body;

        if (!sheetId || !materialInput) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const claudeApiKey = process.env.CLAUDE_API_KEY;
        if (!claudeApiKey) {
            return res.status(500).json({ error: 'Claude API key not configured' });
        }

        // Check cache first
        let cachedData = getCachedData(sheetId);
        let csvData;
        let promptTemplate;
        let cacheStatus = '';

        if (cachedData) {
            console.log('Found cached data for sheet:', sheetId);
            updateLastAccessed(sheetId);
            
            // Check if we need to fetch fresh data
            console.log('Checking if Google Sheets data has changed...');
            const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
            const sheetsResponse = await fetch(csvUrl);
            
            if (sheetsResponse.ok) {
                const freshCsvData = await sheetsResponse.text();
                
                if (!hasDataChanged(sheetId, freshCsvData)) {
                    console.log('Using cached data - no changes detected');
                    csvData = cachedData.csvData;
                    promptTemplate = cachedData.promptTemplate;
                    cacheStatus = 'cached';
                } else {
                    console.log('Data has changed, updating cache...');
                    csvData = freshCsvData;
                    cacheStatus = 'updated';
                }
            } else {
                console.log('Failed to fetch fresh data, using cached data');
                csvData = cachedData.csvData;
                promptTemplate = cachedData.promptTemplate;
                cacheStatus = 'cached_fallback';
            }
        } else {
            console.log('No cached data found, fetching from Google Sheets...');
            const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
            
            const sheetsResponse = await fetch(csvUrl);
            
            if (!sheetsResponse.ok) {
                console.error('Google Sheets fetch failed:', sheetsResponse.status, sheetsResponse.statusText);
                if (sheetsResponse.status === 404) {
                    throw new Error('Sheet not found. Make sure the sheet is public and the ID is correct.');
                } else if (sheetsResponse.status === 403) {
                    throw new Error('Access denied. Make sure the sheet is set to "Anyone with the link can view".');
                } else {
                    throw new Error(`Failed to fetch sheet: ${sheetsResponse.status} ${sheetsResponse.statusText}`);
                }
            }

            csvData = await sheetsResponse.text();
            cacheStatus = 'fresh';
        }

        console.log('CSV data length:', csvData.length, 'Cache status:', cacheStatus);

        // Generate or use cached prompt template
        if (!promptTemplate) {
            console.log('Generating new prompt template...');
            promptTemplate = `You are a GBID converter. Use the following database to convert materials to GBID format.

DATABASE (CSV format):
{{CSV_DATA}}

INSTRUCTIONS:
Give me a list of GBIDs based on the following format, using my GBID database as data. If there is a footage instead of a qty, input the footage in its place (do not include measurement symbols - for example, 200' should print out as just 200). If there are multiple "cuts" or "rolls" of an item (namely wire), multiply the length by the amount of cuts/rolls to get the final qty (for example, 2 cuts of 400' of wire would become qty 800, 2 rolls of 500' would be qty 1000). Items are normally input as per item - ff an item requests a number of boxes, use the properties column to determine how many qty is in each box, then output the total qty as a multiple of that. If an item has a size, such as 2" rigid conduit, search for the item first, then the size within the GBID field. Only write notes at the end of the message, do not interrupt the list. Assume standard for all parts unless specified. Use the "alternate names" column to find the closest name for items with names that do not match. Read the special notes column for all items before output to determine which part numbers are usually standard or if there are any special instructions. Read through every line and every column regardless of whether or not the item is present in the request. Search online for alternate or slang terms if necessary. Do not hallucinate part numbers if you cannot find them. If you cannot find the item after exhausting all options, write NO BID as the GBID and 1 as the QTY.

GBID[tab]QTY
GBID[tab]QTY
GBID[tab]QTY

Create the list based on this message:

{{MATERIAL_INPUT}}`;
            
            // Cache the prompt template with the CSV data
            await setCachedData(sheetId, csvData, promptTemplate);
        }

        // Prepare Claude API request by replacing placeholders
        const claudePrompt = promptTemplate
            .replace('{{CSV_DATA}}', csvData)
            .replace('{{MATERIAL_INPUT}}', materialInput);

        console.log('Calling Claude API...');

        // Call Claude API
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': claudeApiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4000,
                messages: [{
                    role: 'user',
                    content: claudePrompt
                }]
            })
        });

        console.log('Claude response status:', claudeResponse.status);

        if (!claudeResponse.ok) {
            const errorText = await claudeResponse.text();
            console.error('Claude API error:', errorText);
            throw new Error(`Claude API error: ${claudeResponse.status} - ${errorText}`);
        }

        const claudeData = await claudeResponse.json();
        console.log('Claude response received successfully');
        
        return res.status(200).json({
            result: claudeData.content[0].text
        });

    } catch (error) {
        console.error('Error in Claude function:', error);
        return res.status(500).json({ 
            error: error.message || 'Internal server error' 
        });
    }
}
