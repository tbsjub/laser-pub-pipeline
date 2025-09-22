import axios from 'axios';
import https from 'https';
import { authData, CONF_URL } from '../config/confluenceConfig.js';
import * as ejs from 'ejs';
import { readFileSync } from 'fs';

interface GetPageResponse {
  id: string;
  version: {
    number: number;
  };
}

interface UpdatePageResponse {
  id: string;
}

type RenderRequest = { template: string; data: Record<string, unknown> };

function isRenderRequest(value: unknown): value is RenderRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'template' in (value as Record<string, unknown>)
  );
}

export default async function updatePage(
  pageId: number,
  newTitle: string,
  newContent: string | RenderRequest
): Promise<UpdatePageResponse> {
  console.log('>>> Fetching current page data...');

  try {
    const getRes = await axios.get<GetPageResponse>(
      `${CONF_URL}/rest/api/content/${pageId}?expand=version`,
      {
        headers: {
          Authorization: `Basic ${authData}`,
          'X-Atlassian-Token': 'no-check',
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      }
    );

    const currentPage = getRes.data;
    const newVersion = currentPage.version.number + 1;

    console.log(`>>> Updating page to version ${newVersion}...`);

    // Prepare HTML content: either use the provided HTML string or render from EJS
    const htmlContent: string = isRenderRequest(newContent)
      ? ejs.render(readFileSync(newContent.template, 'utf-8'), newContent.data)
      : newContent;

    const updateRes = await axios.put<UpdatePageResponse>(
      `${CONF_URL}/rest/api/content/${pageId}`,
      {
        id: pageId,
        type: 'page',
        title: newTitle,
        version: {
          number: newVersion,
        },
        body: {
          storage: {
            value: htmlContent,
            representation: 'storage',
          },
        },
      },
      {
        headers: {
          Authorization: `Basic ${authData}`,
          'Content-Type': 'application/json',
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      }
    );

    console.log('Page updated successfully!');
    return updateRes.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error('Failed to update page:', err.response?.data || err.message);
    throw error;
  }
}