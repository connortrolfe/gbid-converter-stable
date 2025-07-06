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

        // Fetch Google Sheets data directly
        const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
        const sheetsResponse = await fetch(csvUrl);
        if (!sheetsResponse.ok) {
            if (sheetsResponse.status === 404) {
                throw new Error('Sheet not found. Make sure the sheet is public and the ID is correct.');
            } else if (sheetsResponse.status === 403) {
                throw new Error('Access denied. Make sure the sheet is set to "Anyone with the link can view".');
            } else {
                throw new Error(`Failed to fetch sheet: ${sheetsResponse.status} ${sheetsResponse.statusText}`);
            }
        }
        const csvData = await sheetsResponse.text();

        // Prepare Claude API request using built-in prompt caching
        const systemPrompt = `You are a GBID converter. Use the following database to convert materials to GBID format.\n\nDATABASE (CSV format):\n${csvData}\n\nINSTRUCTIONS:\nGive me a list of GBIDs based on the following format, using my GBID database as data. If there is a footage instead of a qty, input the footage in its place (do not include measurement symbols - for example, 200' should print out as just 200). If there are multiple \"cuts\" or \"rolls\" of an item (namely wire), multiply the length by the amount of cuts/rolls to get the final qty (for example, 2 cuts of 400' of wire would become qty 800, 2 rolls of 500' would be qty 1000). Items are normally input as per item - if an item requests a number of boxes, use the properties column to determine how many qty is in each box, then output the total qty as a multiple of that. If an item has a size, such as 2\" rigid conduit, search for the item first, then the size within the GBID field. Only write notes at the end of the message, do not interrupt the list. Assume standard for all parts unless specified. Use the \"alternate names\" column to find the closest name for items with names that do not match. Read the special notes column for all items before output to determine which part numbers are usually standard or if there are any special instructions. Read through every line and every column regardless of whether or not the item is present in the request. Search online for alternate or slang terms if necessary. Do not hallucinate part numbers if you cannot find them. If you cannot find the item after exhausting all options, write NO BID as the GBID and 1 as the QTY.\n\nGBID[tab]QTY\nGBID[tab]QTY\nGBID[tab]QTY`;

        const anthropicPayload = {
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4000,
            system: [
                {
                    type: 'text',
                    text: systemPrompt,
                    cache_control: { type: 'ephemeral' }
                }
            ],
            messages: [
                {
                    role: 'user',
                    content: materialInput
                }
            ]
        };

        // Call Claude API
        const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': claudeApiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(anthropicPayload)
        });

        if (!claudeResponse.ok) {
            const errorText = await claudeResponse.text();
            throw new Error(`Claude API error: ${claudeResponse.status} - ${errorText}`);
        }

        const claudeData = await claudeResponse.json();
        return res.status(200).json({
            result: claudeData.content[0].text,
            usage: claudeData.usage // includes cache hit info
        });
    } catch (error) {
        return res.status(500).json({ 
            error: error.message || 'Internal server error' 
        });
    }
}
