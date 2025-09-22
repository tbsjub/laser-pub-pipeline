import axios from 'axios';
import https from 'https';
import { authData, CONF_URL } from '../config/confluenceConfig.js';
import * as fs from 'fs';
import FormData from 'form-data';

interface UploadAttachmentResponse {
  results: Array<{
    id: string;
    title: string;
    _links: {
      download: string;
    };
  }>;
}

export default async function uploadAttachment(
  pageId: number,
  filePath: string,
  filename: string
): Promise<UploadAttachmentResponse> {
  console.log(`>>> Uploading attachment: ${filename} to page ${pageId}...`);

  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    // Create form data
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), {
      filename: filename,
      contentType: 'image/png'
    });
    form.append('minorEdit', 'true');

    const response = await axios.post<UploadAttachmentResponse>(
      `${CONF_URL}/rest/api/content/${pageId}/child/attachment`,
      form,
      {
        headers: {
          Authorization: `Basic ${authData}`,
          'X-Atlassian-Token': 'no-check',
          ...form.getHeaders(),
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      }
    );

    console.log(`✅ Attachment uploaded successfully: ${filename}`);
    return response.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown }; message?: string };
    console.error(`❌ Failed to upload attachment ${filename}:`, err.response?.data || err.message);
    throw error;
  }
}
