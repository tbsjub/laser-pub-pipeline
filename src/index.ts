import { readFileSync, writeFileSync } from 'fs';
import ejs from 'ejs';
import getPage from './api/getPage';
import parseConfluenceTable from './data/htmlToJSON';
import getData from './api/getData';
import createTimelineGraph from './templates/e5graph';

const PVS: string[] = [ "L3-SBW4-PM311:Energy",
  "L3-PSS:STATE_EXH_EXTERNAL_HIGH_P",
  "L3-PSS:SGV501_IN_OPEN_POSITION",
  "L3BT-VCS-SGV505:OPEN"
];

async function run(): Promise<void> {
  const pageId = 1687519372; // set your test page ID here
  const downloadedHtmlPath = './templates/getPageContent.html';
  const ejsTemplatePath = './templates/putPageContent.ejs';
  const renderedOutputPath = './templates/ejsRender.html';

  console.log('>>> 1) Downloading page...');
  await getPage(pageId, downloadedHtmlPath);

  console.log('>>> 2) Parsing HTML to JSON...');
  const html = readFileSync(downloadedHtmlPath, 'utf-8');
  const data = parseConfluenceTable(html);
  console.log('Parsed data:', data);

  // console.log('>>> 3) Rendering EJS with parsed data...');
  // const template = readFileSync(ejsTemplatePath, 'utf-8');
  // const rendered = ejs.render(template, data);
  // writeFileSync(renderedOutputPath, rendered, 'utf-8');

  console.log('>>>3 ) getting the data: ');
  if (PVS.length === 0) {
    throw new Error('No PVs configured in PVS array.');
  }
  for (const pv of PVS) {
    const pemPath = './geant_issue.pem';
    const timeSpan = '1d';
    const safeName = pv.replace(/[^a-zA-Z0-9-_\.]/g, '_');
    const outputFile = `./data/${safeName}.csv`;
    await getData({ pv, pemPath, timeSpan, outputFile, rejectUnauthorized: false });
  }

  console.log(`Rendered EJS written to ${renderedOutputPath}`);

  console.log('>>> 4) Creating timeline graph...');
  const graphHTML = createTimelineGraph();
  const graphOutputPath = './templates/timelineGraph.html';
  writeFileSync(graphOutputPath, graphHTML, 'utf-8');
  console.log(`Timeline graph written to ${graphOutputPath}`);
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
