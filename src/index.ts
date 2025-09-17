import { readFileSync, writeFileSync } from 'fs';
import * as fs from 'fs';
import ejs from 'ejs';
import getPage from './api/getPage.js';
import updatePage from './api/updatePage.js';
import parseConfluenceTable from './data/htmlToJSON.js';
import getData from './api/getData.js';
import createPage from './api/createPage.js';
import rundataCreation from './data/rundataCreation.js';
import userRunCode from './templates/user_run_code.js'; 


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
  const templateId = 1734541382;
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
  let run_days: number[] = [];
 
  
  if (data.dateRange) {
    theStart = data.dateRange.split(' - ')[0]?.replace(/\//g, '-');
    theEnd = data.dateRange.split(' - ')[1]?.replace(/\//g, '-');
  }

  if(data.weekNumbersCommaSeparated) {
    run_days = data.weekNumbersCommaSeparated.split(',').map((day: string) => Number(day.trim()));
  }

  console.log('>>> 3) Processing each day separately...');
  
  if (PVS.length === 0) {
    throw new Error('No PVs configured in PVS array.');
  }

  if (run_days && run_days.length > 0) {
    // Extract month and year from the date range
    const startDate = new Date(theStart || '');
    const year = startDate.getFullYear();
    const month = startDate.getMonth() + 1; // getMonth() returns 0-11, so add 1
    
    console.log(`📅 Processing days for ${year}-${month.toString().padStart(2, '0')}`);
    console.log(`📋 Days to process: ${run_days.join(', ')}`);

    for (const day of run_days) {
      console.log(`\n🔄 Processing Day ${day}...`);
      
      // Create the full date for this specific day
      const dayDate = new Date(year, month - 1, day+1);
      const dayString = dayDate.toISOString().split('T')[0]; // Get YYYY-MM-DD format
      
      console.log(`  📅 Day ${day} date: ${dayString}`);
      
      // Get data for this specific day
      console.log(`  📊 Fetching data for day ${day}...`);
      for (const pv of PVS) {
        const pemPath = './geant_issue.pem';
        const safeName = pv.replace(/[^a-zA-Z0-9-_\.]/g, '_');
        const outputFile = `./data/day_${day}_${safeName}.csv`;
        await getData({ pv, theDay: dayString!, outputFile, pemPath, rejectUnauthorized: false });
      }
      
      // Create rundata.json for this day
      console.log(`  🔄 Creating rundata.json for day ${day}...`);
      await rundataCreation(PVS, `day_${day}_`);
      
      // Generate charts for this day
      console.log(`  📈 Generating charts for day ${day}...`);
      await userRunCode.generateCharts([day], `day_${day}_`);
      
      console.log(`  ✅ Day ${day} processing complete!`);
    }
    
    console.log('\n🎉 All days processed successfully!');
  } else {
    console.log('No run days specified, skipping processing');
  }

  // Helper function to convert image to base64
  function imageToBase64(imagePath: string): string {
    try {
      const imageBuffer = fs.readFileSync(imagePath);
      const base64 = imageBuffer.toString('base64');
      return `data:image/png;base64,${base64}`;
    } catch (error) {
      console.warn(`Could not load image: ${imagePath}`);
      return ''; // Return empty string if image doesn't exist
    }
  }

  // // Merge Confluence data with template data
  // const mergedData = {
  //   ...data,  // All the data from Confluence page (title, userCampaign, dateRange, etc.)
  //   weeks: run_days.map(day => ({
  //     number: day.toString(),
  //     // Use base64 encoded images for direct embedding
  //     graphUrl: imageToBase64(`./visualization/day${day}_power_day_.png`),
  //     beamProfileGraph: imageToBase64(`./visualization/day${day}_NF_C91.png`),
  //     beamPointingGraph: imageToBase64(`./visualization/day${day}_FF_C92.png`)
  //   }))
  // };

  // console.log('>>>6) Rendering EJS with merged data...');
  // const template = readFileSync(ejsTemplatePath, 'utf-8');
  // const rendered = ejs.render(template, mergedData);
  // writeFileSync(renderedOutputPath, rendered, 'utf-8');

  // console.log('>>>7) Updating page...');
  // await updatePage(templateId, 'L1 ALLEGRA user time performance report', rendered);

}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});



