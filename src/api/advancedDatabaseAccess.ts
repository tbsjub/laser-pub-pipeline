import axios from 'axios';
import https from 'https';
import { writeFile } from 'fs/promises';
import * as cheerio from 'cheerio';
import { authData, CONF_URL } from '../config/confluenceConfig.js';

interface DatabaseRow {
    [key: string]: string;
}

interface DatabaseData {
    headers: string[];
    rows: DatabaseRow[];
    totalRows: number;
}

// Advanced HTML parsing for Confluence database tables
function parseConfluenceDatabase(htmlContent: string): DatabaseData | null {
    try {
        const $ = cheerio.load(htmlContent);
        
        // Look for Confluence-specific database structures
        // Confluence databases often use specific CSS classes or data attributes
        
        // Try multiple selectors that Confluence might use
        const possibleSelectors = [
            'table.ac-table',           // Confluence table class
            'table[data-table-id]',     // Tables with data attributes
            '.ac-table table',          // Nested table structures
            'table.ac-database-table',  // Database-specific tables
            'table',                    // Fallback to any table
            '.ac-database-view table',  // Database view tables
            '.ac-database table'        // Another possible structure
        ];
        
        let table: cheerio.Cheerio<cheerio.Element> | null = null;
        
        for (const selector of possibleSelectors) {
            const found = $(selector);
            if (found.length > 0) {
                console.log(`Found table using selector: ${selector}`);
                table = found.first();
                break;
            }
        }
        
        if (!table) {
            console.log("No database table found with any selector");
            return null;
        }
        
        const headers: string[] = [];
        const rows: DatabaseRow[] = [];
        
        // Extract headers - try multiple approaches
        const headerRow = table.find('tr').first();
        
        // Look for th elements first
        headerRow.find('th').each((_, element) => {
            headers.push($(element).text().trim());
        });
        
        // If no th elements, try first row td elements
        if (headers.length === 0) {
            headerRow.find('td').each((_, element) => {
                headers.push($(element).text().trim());
            });
        }
        
        // If still no headers, try to infer from data attributes or classes
        if (headers.length === 0) {
            const firstDataRow = table.find('tr').eq(1);
            firstDataRow.find('td').each((_, element) => {
                const $el = $(element);
                // Try to get header from data attributes or classes
                const header = $el.attr('data-column') || 
                             $el.attr('data-field') || 
                             $el.attr('class')?.replace(/^ac-/, '') ||
                             `Column_${headers.length + 1}`;
                headers.push(header);
            });
        }
        
        console.log(`Found ${headers.length} headers:`, headers);
        
        // Extract data rows
        table.find('tr').each((rowIndex, rowElement) => {
            // Skip header row
            if (rowIndex === 0) return;
            
            const $row = $(rowElement);
            const row: DatabaseRow = {};
            
            $row.find('td').each((cellIndex, cellElement) => {
                const $cell = $(cellElement);
                const header = headers[cellIndex] || `Column_${cellIndex + 1}`;
                
                // Get cell content, handling various Confluence cell formats
                let cellValue = $cell.text().trim();
                
                // If cell is empty, try to get content from nested elements
                if (!cellValue) {
                    const nestedContent = $cell.find('span, div, a').text().trim();
                    if (nestedContent) {
                        cellValue = nestedContent;
                    }
                }
                
                // Handle special Confluence elements like user mentions, status badges, etc.
                const statusBadge = $cell.find('.ac-badge, .status-badge').text().trim();
                if (statusBadge) {
                    cellValue = statusBadge;
                }
                
                row[header] = cellValue;
            });
            
            // Only add row if it has content
            if (Object.values(row).some(value => value && value.trim())) {
                rows.push(row);
            }
        });
        
        console.log(`Extracted ${rows.length} data rows`);
        
        return {
            headers,
            rows,
            totalRows: rows.length
        };
        
    } catch (error) {
        console.error("Error parsing Confluence database:", error);
        return null;
    }
}

// Try to access the database export functionality
async function tryDatabaseExport(databaseId: number): Promise<void> {
    console.log("Attempting to access database export functionality...");
    
    try {
        // Try to access the database page with export parameters
        const exportUrls = [
            `${CONF_URL}/pages/viewpage.action?pageId=${databaseId}&export=true`,
            `${CONF_URL}/pages/viewpage.action?pageId=${databaseId}&mode=export`,
            `${CONF_URL}/pages/viewpage.action?pageId=${databaseId}&format=csv`,
            `${CONF_URL}/pages/viewpage.action?pageId=${databaseId}&exportFormat=csv`
        ];
        
        for (const url of exportUrls) {
            try {
                console.log(`Trying export URL: ${url}`);
                const response = await axios.get(url, {
                    headers: {
                        Authorization: `Basic ${authData}`,
                        'Accept': 'text/html,application/csv,text/csv,*/*',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    httpsAgent: new https.Agent({
                        rejectUnauthorized: false,
                    }),
                });
                
                console.log(`Export URL successful: ${url}`);
                console.log("Content type:", response.headers['content-type']);
                console.log("Content length:", response.data.length);
                
                // Save the response for inspection
                const filename = `./export_attempt_${exportUrls.indexOf(url)}.html`;
                await writeFile(filename, response.data, 'utf-8');
                console.log(`Saved response to ${filename}`);
                
                // Try to parse as database
                const tableData = parseConfluenceDatabase(response.data);
                if (tableData) {
                    console.log("Successfully parsed database from export attempt!");
                    await writeFile(`./export_database_${exportUrls.indexOf(url)}.json`, 
                        JSON.stringify(tableData, null, 2), 'utf-8');
                }
                
            } catch (error: any) {
                console.log(`Export URL failed: ${url} - Status: ${error.response?.status}`);
            }
        }
        
    } catch (error) {
        console.error("Database export attempts failed:", error);
    }
}

// Try to find database-specific API endpoints
async function findDatabaseEndpoints(databaseId: number): Promise<void> {
    console.log("Searching for database-specific API endpoints...");
    
    // These are some endpoints that might exist for databases
    const possibleEndpoints = [
        `${CONF_URL}/rest/api/database/${databaseId}`,
        `${CONF_URL}/rest/api/database/${databaseId}/data`,
        `${CONF_URL}/rest/api/database/${databaseId}/export`,
        `${CONF_URL}/rest/api/database/${databaseId}/table`,
        `${CONF_URL}/rest/api/content/${databaseId}/database`,
        `${CONF_URL}/rest/api/content/${databaseId}/database/data`,
        `${CONF_URL}/rest/api/content/${databaseId}/database/export`,
        `${CONF_URL}/rest/api/content/${databaseId}/table`,
        `${CONF_URL}/rest/api/content/${databaseId}/table/data`
    ];
    
    for (const endpoint of possibleEndpoints) {
        try {
            console.log(`Trying endpoint: ${endpoint}`);
            const response = await axios.get(endpoint, {
                headers: {
                    Authorization: `Basic ${authData}`,
                    'Content-Type': 'application/json',
                },
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false,
                }),
            });
            
            console.log(`Endpoint successful: ${endpoint}`);
            console.log("Response status:", response.status);
            console.log("Available keys:", Object.keys(response.data));
            
            // Save successful responses
            const filename = `./endpoint_${endpoint.split('/').pop()}.json`;
            await writeFile(filename, JSON.stringify(response.data, null, 2), 'utf-8');
            console.log(`Saved response to ${filename}`);
            
        } catch (error: any) {
            console.log(`Endpoint failed: ${endpoint} - Status: ${error.response?.status}`);
        }
    }
}

// Main function to try all advanced approaches
async function tryAdvancedDatabaseAccess(databaseId: number): Promise<void> {
    console.log("=== Advanced Database Access Attempts ===");
    
    // Try to find database-specific endpoints
    await findDatabaseEndpoints(databaseId);
    
    // Try export functionality
    await tryDatabaseExport(databaseId);
    
    console.log("Advanced database access attempts completed.");
}

export { 
    parseConfluenceDatabase, 
    tryDatabaseExport, 
    findDatabaseEndpoints, 
    tryAdvancedDatabaseAccess,
    type DatabaseData,
    type DatabaseRow
};

