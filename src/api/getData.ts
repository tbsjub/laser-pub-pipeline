import https from 'https';
import { createWriteStream, existsSync, readFileSync } from 'fs';

type DownloadFormat = 'csv' | 'json';

export interface DownloadOptions {
  pv: string;
  theStart: string;
  theEnd: string;
  outputFile: string; // e.g., "data.csv"
  pemPath: string; // path to certificate PEM file
  hostname?: string; // default: servicestatus.eli-beams.eu
  port?: number; // default: 7000
  format?: DownloadFormat; // default: 'csv'
  rejectUnauthorized?: boolean; // default: true
}

function createHttpsAgent(pemPath: string, rejectUnauthorized: boolean = true): https.Agent {
  if (!existsSync(pemPath)) {
    throw new Error(`PEM certificate file not found at path: ${pemPath}`);
  }

  const pemContent = readFileSync(pemPath);
  return new https.Agent({
    ca: pemContent,
    rejectUnauthorized,
  });
}

export async function downloadPVData(options: DownloadOptions): Promise<void> {
  const {
    pv,
    theStart,
    theEnd,
    outputFile,
    pemPath,
    hostname = 'servicestatus.eli-beams.eu',
    port = 7000,
    format = 'csv',
    rejectUnauthorized = true,
  } = options;

  const httpsAgent = createHttpsAgent(pemPath, rejectUnauthorized);
  // https://servicestatus.eli-beams.eu:7000/variable/retrieve/L3-SBW4-PM311:Energy?startDate=2023-06-01&endDate=2023-06-06&format=html
  const path = `/variable/retrieve/${encodeURIComponent(pv)}?startDate=${encodeURIComponent(theStart)}&endDate=${encodeURIComponent(theEnd)}&format=${encodeURIComponent(format)}`;

  const requestOptions: https.RequestOptions = {
    hostname,
    port,
    path,
    method: 'GET',
    agent: httpsAgent,
  };

  await new Promise<void>((resolve, reject) => {
    const writeStream = createWriteStream(outputFile);

    const req = https.request(requestOptions, (res) => {
      const statusCode = res.statusCode ?? 0;
      const statusMessage = res.statusMessage ?? '';

      console.log('statusCode:', statusCode);
      console.log('headers:', res.headers);

      if (statusCode < 200 || statusCode >= 300) {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          reject(new Error(`Request failed (${statusCode} ${statusMessage}). Body: ${body}`));
        });
        return;
      }

      res.pipe(writeStream);

      res.on('error', (err) => {
        reject(err);
      });

      writeStream.on('finish', () => {
        console.log(`File written to ${outputFile}`);
        resolve();
      });

      writeStream.on('error', (err) => {
        reject(err);
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.end();
  });
}

export default downloadPVData;



