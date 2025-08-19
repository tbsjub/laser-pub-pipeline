## Laser Pub Pipeline (Confluence Automation)

TypeScript/Node toolkit for automating Confluence content:

- Create Confluence pages
- Update existing pages with proper versioning
- Render rich Confluence “storage” HTML from EJS templates
- Fetch page content for inspection
- Parse simple Confluence tables to JSON
- Experimental utilities to probe and export database-like tables


### Prerequisites

- Node.js 18+ (ESM/NodeNext)
- A Confluence instance (Cloud or Data Center) and an API token


### Installation

This project’s `package.json` lives under `src/`.

```bash
cd src
npm install
```


### Configuration

Create a `.env` file in `src/` with your credentials:

```ini
EMAIL=your.email@example.com          # Confluence/Atlassian account email
API_KEY=your_api_token                # Atlassian API token (not your password)
CONF_URL=https://your-confluence-base # e.g. https://your-domain.atlassian.net/wiki
```

These are read by `src/config/confluenceConfig.ts` and exported as:

- `authData` (Basic auth header)
- `CONF_URL` (base URL)

If any variable is missing, the app throws: “Missing required environment variables: EMAIL, API_KEY, CONF_URL”.


### Scripts

Run from the `src/` directory:

- `npm run dev` — execute `src/index.ts` with ts-node (recommended during development)
- `npm run test:basic` — run a basic database-page probe (`src/testDatabase.ts`)
- `npm run test:database` — run the comprehensive database access test (`src/comprehensiveDatabaseTest.ts <database_id>`)
- `npm run build` — compile TypeScript
- `npm start` — run compiled code (expects `dist/index.js`; see note in Troubleshooting)


### Core APIs

All API modules live under `src/api/` and use Axios against Confluence’s REST API with Basic auth.

#### Create a page — `createPage`

File: `src/api/createPage.ts`

```ts
import createPage from './api/createPage.js';

await createPage(
  'CS',                    // space key
  'My Page Title',         // title
  '<p>Hello from EJS/HTML</p>', // Confluence storage HTML
  1234567890               // optional parent page ID
);
```

#### Update a page — `updatePage`

File: `src/api/updatePage.ts`

`updatePage` fetches the current version, increments it, and updates the page body. You can pass a raw HTML string or an EJS render request.

```ts
import updatePage from './api/updatePage.js';

// Option A: raw HTML string
await updatePage(1682210847, 'New Title', '<p>Updated content</p>');

// Option B: render from an EJS template
await updatePage(1682210847, 'Report Title', {
  template: './templates/putPageContent.ejs',
  data: {
    title: 'L1 ALLEGRA user time performance report',
    campaign: { name: 'User Campaign', weeksLabel: 'Weeks 1–4', dateRange: '2024-01-01 – 2024-02-01' },
    specs: { pulseEnergy: '...', pulseDuration: '...', wavelength: '...' },
    hourCount: { totalActiveDays: 10, totalActiveHours: 120, usedAlignment: { archiver: '...', operator: '...' }, usedHighPower: { archiver: '...' } },
    weeks: [{ number: 1, graphUrl: 'https://...' }],
    dazzlerSettings: ['setting A', 'setting B'],
    timezone: 'UTC'
  }
});
```

#### Get a page’s storage HTML — `getPage`

File: `src/api/getPage.ts`

```ts
import getPage from './api/getPage.js';

await getPage(1682210847); // writes `.usefullPVS.html` with page storage HTML
```


### EJS Templates

- Templates live under `src/templates/`
- `putPageContent.ejs` is a styled Confluence “storage” HTML template that expects a `locals` object. The example data structure in the `updatePage` call above aligns with the placeholders used in the template.
- You can design any EJS template and pass its path and `data` to `updatePage`.


### Utilities

#### Parse simple Confluence tables to JSON — `htmlToJSON`

File: `src/data/htmlToJSON.ts`

Parses a 2-column table (name/value) into a normalized JSON object where keys are camel-cased.

```ts
import parseConfluenceTable from './data/htmlToJSON.js';

const json = parseConfluenceTable('<table>...');
// => { pulseEnergy: '...', pulseDuration: '...', wavelength: '...' }
```

#### Experimental database helpers

Files: `src/api/getDatabase.js`, `src/api/advancedDatabaseAccess.ts`

- Try to fetch a “database” page and dump its storage HTML to `./usefulPVS.html`
- Attempt multiple known/guess endpoints and export modes
- Parse discovered tables (via Cheerio) into JSON

Comprehensive test runner:

```bash
npm run test:database -- 1234567890
```

Outputs: `export_attempt_*.html`, `export_database_*.json`, `endpoint_*.json` (depending on what’s accessible in your Confluence).


### Example entry point

File: `src/index.ts` contains a minimal example that updates a page using an EJS template. Adjust `pageId`, template path, and data as needed, then:

```bash
npm run dev
```


### Project Structure

```
src/
  api/
    advancedDatabaseAccess.ts   # probes/exports/parse database-like tables
    createPage.ts               # create page
    getPage.ts                  # read page storage HTML
    getDatabase.js              # basic database page fetch (JS)
    updatePage.ts               # update page with versioning + EJS rendering
  config/
    confluenceConfig.ts         # dotenv, auth header, base URL
  data/
    htmlToJSON.ts               # parse simple 2-col tables into JSON
  templates/
    getPageContent.html         # example storage HTML
    putPageContent.ejs          # EJS template for reports
    putPageTemplate.html        # static HTML example
  comprehensiveDatabaseTest.ts  # orchestrates advanced database attempts
  testDatabase.ts               # basic database-page attempt
  index.ts                      # sample entry point
  package.json                  # scripts and deps
  tsconfig.json
```


### Security note

HTTP clients are configured with `httpsAgent: { rejectUnauthorized: false }` to simplify connectivity during development/testing. For production, you should remove this and use valid TLS certificates.


### Troubleshooting

- 401/403: Verify `EMAIL`/`API_KEY`, user permissions, and space/page-level permissions.
- SSL or certificate errors: Ensure `CONF_URL` is correct and decide whether to keep or remove `rejectUnauthorized: false`.
- `npm start` fails with “Cannot find dist/index.js”: Either run `npm run dev` or set `tsconfig.json` `outDir` to `./dist` and re-run `npm run build`.
- Confluence Cloud vs DC: Endpoints are similar but features can differ; confirm your instance supports the API paths being probed.


### License

ISC (see `package.json`).


