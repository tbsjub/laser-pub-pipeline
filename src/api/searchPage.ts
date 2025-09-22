import axios from 'axios';
import https from 'https';
import { authData, CONF_URL } from '../config/confluenceConfig.js';

interface SearchPageResponse {
  results: {
    id?: string;
    title: string;
    content?: {
      id: string;
      title: string;
      type: string;
      status: string;
      _links?: {
        webui: string;
        self: string;
        tinyui: string;
      };
    };
    version?: {
      number: number;
    };
    _links?: {
      webui: string;
    };
  }[];
}

export default async function searchPage(
  title: string,
  spaceKey: string,
  parentId?: number
): Promise<{ id: string; title: string } | null> {
  try {
    console.log(`>>> Searching for page with title "${title}" in space "${spaceKey}"...`);

    // Build CQL query (search by title and space, optionally parent)
    let cql = `title="${title}" AND space="${spaceKey}" AND type=page`;
    if (parentId) {
      cql += ` AND parent=${parentId}`;
    }

    const res = await axios.get<SearchPageResponse>(
      `${CONF_URL}/rest/api/search?cql=${encodeURIComponent(cql)}`,
      {
        headers: {
          Authorization: `Basic ${authData}`,
          'X-Atlassian-Token': 'no-check',
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      }
    );

    const results = res.data.results;
    if (results.length === 0) {
      console.log('>>> No page found with that title.');
      return null;
    }

    const page = results[0];
    
    // Handle the nested structure - ID is under content, title is at top level
    const pageId = page!.content?.id || page!.id;
    const pageTitle = page!.title;
    
    console.log(`>>> Found page: "${pageTitle}" (ID: ${pageId})`);
    
    if (!pageId) {
      console.error('>>> ERROR: Page found but ID is undefined!');
      console.error('>>> Full page object:', page);
      return null;
    }
    
    return { id: pageId, title: pageTitle };
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('Failed to search page:', err.response?.data || err.message);
    throw error;
  }
}
