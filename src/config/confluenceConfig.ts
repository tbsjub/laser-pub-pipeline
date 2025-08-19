// index.ts
import dotenv from 'dotenv';
dotenv.config();

const username = process.env.EMAIL;
const password = process.env.API_KEY;
export const CONF_URL = process.env.CONF_URL;
export const spaceKey = 'CS';

if (!username || !password || !CONF_URL) {
  throw new Error('Missing required environment variables: EMAIL, API_KEY, CONF_URL');
}

export const authData = Buffer.from(`${username}:${password}`).toString('base64');