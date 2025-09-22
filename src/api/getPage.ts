import axios from 'axios';
import https from 'https';
import fs from 'fs';
import { writeFile} from 'fs/promises';
import { authData, CONF_URL } from '../config/confluenceConfig.js';

interface GetPageResponse {
    id: string;
}

async function getPage(pageId: number, outputPath: string): Promise<GetPageResponse | void> {
    console.log("Initiating REST request.....");

    const getRes = await axios.get(
        `${CONF_URL}/rest/api/content/${pageId}?expand=body.storage`,
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
    try {
        await writeFile(outputPath, getRes.data.body.storage.value, 'utf-8');
        console.log("Page gotton successfully at: ", outputPath);
    } catch (error) {
        console.error("Error getting page:", error);
    }
}

export default getPage;
