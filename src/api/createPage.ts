import axios from 'axios';
import https from 'https';
import { authData, CONF_URL } from '../config/confluenceConfig.js';


interface CreatePageResponse {
  id: string;
  title: string;
}

async function createPage(
  spaceKey: string,
  pageTitle: string,
  pageContent: string,
  parentId?: number 
): Promise<CreatePageResponse | void> {
  console.log('Initiating REST request.....');

  const data = {
    type: 'page',
    title: pageTitle,
    space: {
      key: spaceKey,
    },
    body: {
      storage: {
        value: pageContent,
        representation: 'storage',
      },
    },
    ancestors: parentId ? [{ id: parentId }] : [],
    version: {
      minorEdit: true,
    },
  };

  try {
    const response = await axios.post<CreatePageResponse>(
      `${CONF_URL}/rest/api/content`,
      data,
      {
        headers: {
          Authorization: `Basic ${authData}`,
          'Content-Type': 'application/json',
          'X-Atlassian-Token': 'no-check',
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
      }
    );

    console.log('Page created successfully!');
    return response.data;
  } catch (error) {
    console.error('Error creating page:', error);
  }
}


export default createPage;
