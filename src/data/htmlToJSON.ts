import * as cheerio from 'cheerio';
import { parse } from 'path';

function normalizeKey(key: string): string {
    return key
      .toLowerCase()
      .replace(/[^a-z0-9 ]/gi, '') 
      .split(' ')
      .filter(Boolean)
      .map((word, index) =>
        index === 0
          ? word
          : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join('');
}


function parseConfluenceTable(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const data: Record<string, string> = {};

  $('table tr').each((_, row) => {
    const cells = $(row).find('td');
    if (cells.length !== 2) return;

    let key = $(cells[0]).text().replace(/\s+/g, ' ').trim();
    key = normalizeKey(key);
    const value = $(cells[1]).text().replace(/\s+/g, ' ').trim();

    if (key) data[key] = value;
  });

  return data;
}

export default parseConfluenceTable;