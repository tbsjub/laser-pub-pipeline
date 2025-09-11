import { readFileSync, writeFileSync } from 'fs';
import ejs from 'ejs';
import getPage from './api/getPage.js';
import parseConfluenceTable from './data/htmlToJSON.js';
import getData from './api/getData.js';
import createPage from './api/createPage.js';
import rundataCreation from './data/rundataCreation.js';
import userRunData from './templates/user_run_code.js'; 


// const PVS: string[] = [ "L3-SBW4-PM311:Energy",
//   "L3-PSS:STATE_EXH_EXTERNAL_HIGH_P",
//   "L3-PSS:SGV501_IN_OPEN_POSITION",
//   "L3BT-VCS-SGV505:OPEN"
// ];

//L1 PVS
//   "L1-ALFA-SHU01-61:Out",
//   "L1-OPA3-5_2-PM98:VAL_CAL",
//   "L1-OPA4-PM21:VAL_CAL",
//   "L1-CMP-C91:CentroidX",
//   "L1-CMP-C91:CentroidY",
//   "L1-CMP-C92:CentroidX",
//   "L1-CMP-C92:CentroidY"

var PVS: string[] = [];

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


  if (data.pvs) {
    PVS = data.pvs.split(',').map((pv: string) => pv.trim());
  }

  let theStart: string | undefined;
  let theEnd: string | undefined;
  let run_days;
  
  if (data.dateRange) {
    theStart = data.dateRange.split(' - ')[0]?.replace(/\//g, '-');
    theEnd = data.dateRange.split(' - ')[1]?.replace(/\//g, '-');
  }

  if(data.weekNumbersCommaSeparated) {
    run_days = data.weekNumbersCommaSeparated.split(',').map((day: string) => Number(day.trim()));
  }

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
    const safeName = pv.replace(/[^a-zA-Z0-9-_\.]/g, '_');
    const outputFile = `./data/${safeName}.csv`;
    await getData({ pv, pemPath, theStart: theStart || '', theEnd: theEnd || '', outputFile, rejectUnauthorized: false });
  }


  console.log('>>>4) Running data creation...');
  await rundataCreation(PVS);

  console.log('>>>5) Processing data and creating timeline graph...');
  if (run_days && run_days.length > 0) {
    await userRunData(run_days);
  } else {
    console.log('No run days specified, skipping graph generation');
  }

}
//   console.log('>>>5) Processing data and creating timeline graph...');

// }
//   console.log('>>> 4) Creating timeline graph...');
//   const graphHTML = createTimelineGraph();
//   const graphOutputPath = './templates/timelineGraph.html';
//   writeFileSync(graphOutputPath, graphHTML, 'utf-8');
//   console.log(`Timeline graph written to ${graphOutputPath}`);
// }

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});


// rundataCreation.ts runs automatically when imported

