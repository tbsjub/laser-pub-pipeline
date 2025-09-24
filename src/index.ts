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
import searchPage from './api/searchPage.js';
import uploadAttachment from './api/uploadAttachment.js'; 
import { parse } from 'csv-parse/sync'; 


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


// Validation functions
function validatePageData(data: Record<string, string>): void {
  const requiredFields = ['pvs', 'dateRange', 'daysCommaSeparated', 'title'];
  const missingFields = requiredFields.filter(field => !data[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields in page data: ${missingFields.join(', ')}`);
  }
}

function validateDateRange(dateRange: string): { start: string; end: string } {
  const parts = dateRange.split(' - ');
  if (parts.length !== 2) {
    throw new Error(`Invalid date range format. Expected "start - end", got: ${dateRange}`);
  }
  
  const start = parts[0]?.replace(/\//g, '-');
  const end = parts[1]?.replace(/\//g, '-');
  
  if (!start || !end) {
    throw new Error(`Invalid date range format. Expected "start - end", got: ${dateRange}`);
  }
  
  // Validate date format
  const startDate = new Date(start);
  const endDate = new Date(end);
  
  if (isNaN(startDate.getTime())) {
    throw new Error(`Invalid start date format: ${start}`);
  }
  
  if (isNaN(endDate.getTime())) {
    throw new Error(`Invalid end date format: ${end}`);
  }
  
  if (startDate > endDate) {
    throw new Error(`Start date (${start}) cannot be after end date (${end})`);
  }
  
  return { start, end };
}

function validateRunDays(dayNumbers: string): number[] {
  const days = dayNumbers.split(',').map((day: string) => {
    const num = Number(day.trim());
    if (isNaN(num) || num < 1 || num > 31) {
      throw new Error(`Invalid day number: ${day.trim()}. Must be between 1 and 31`);
    }
    return num;
  });
  
  if (days.length === 0) {
    throw new Error('No valid days specified in daysCommaSeparated');
  }
  
  return days;
}

function validatePVs(pvs: string): string[] {
  const pvList = pvs.split(',').map((pv: string) => pv.trim()).filter(pv => pv.length > 0);
  
  if (pvList.length === 0) {
    throw new Error('No PVs specified in pvs field');
  }
  
  // Validate PV format (basic check)
  const invalidPVs = pvList.filter(pv => !/^[A-Z0-9-:_]+$/i.test(pv));
  if (invalidPVs.length > 0) {
    throw new Error(`Invalid PV format: ${invalidPVs.join(', ')}. PVs should contain only letters, numbers, hyphens, and colons`);
  }
  
  return pvList;
}

function readPVInformation(): Array<{
  pv: string;
  explanation: string;
  unit: string;
  source: string;
  type: string;
  userData: string;
  csIntegration: string;
  triggered: string;
  physicalLocation: string;
}> {
  try {
    const csvPath = './data/Useful PVs.csv';
    const csvContent = readFileSync(csvPath, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    
    return records.map((record: any) => ({
      pv: record.PV || '',
      explanation: record.Explanation || '',
      unit: record.Unit || '',
      source: record.Source || '',
      type: record.Type || '',
      userData: record['User data'] || '',
      csIntegration: record['CS Integration'] || '',
      triggered: record['Triggered?'] || '',
      physicalLocation: record['Physical Location'] || ''
    }));
  } catch (error) {
    console.warn(`Failed to read PV information from CSV: ${error}`);
    return [];
  }
}



async function run(): Promise<void> {
  const pageId = 1687519372; // set your test page ID here
  const templateId = 1734541382;
  const downloadedHtmlPath = './templates/getPageContent.html';
  const ejsTemplatePath = './templates/putPageContent.ejs';
  const renderedOutputPath = './templates/ejsRender.html';

  try {
    // Ensure data directory exists
    if (!fs.existsSync('./data')) {
      console.log('Creating data directory...');
      fs.mkdirSync('./data', { recursive: true });
    }

    console.log('>>> 1) Downloading page...');
    try {
      await getPage(pageId, downloadedHtmlPath);
      console.log('Page downloaded successfully');
    } catch (error) {
      throw new Error(`Failed to download page ${pageId}: ${error}`);
    }

    console.log('>>> 2) Parsing HTML to JSON...');
    let html: string;
    try {
      html = readFileSync(downloadedHtmlPath, 'utf-8');
      if (!html || html.trim().length === 0) {
        throw new Error('Downloaded HTML file is empty');
      }
    } catch (error) {
      throw new Error(`Failed to read downloaded HTML file: ${downloadedHtmlPath}. Error: ${error}`);
    }
    
    let data: Record<string, string>;
    try {
      data = parseConfluenceTable(html);
      if (!data || Object.keys(data).length === 0) {
        throw new Error('No data found in HTML table. Check if the Confluence page has the expected table format');
      }
      console.log('HTML parsed successfully');
      console.log('Parsed data:', data);
    } catch (error) {
      throw new Error(`Failed to parse HTML table: ${error}`);
    }

    // Validate parsed data
    validatePageData(data);

    // Parse and validate PVs
    PVS = validatePVs(data.pvs!);
    console.log(`Validated ${PVS.length} PVs: ${PVS.join(', ')}`);

    // Parse and validate date range
    const { start: theStart, end: theEnd } = validateDateRange(data.dateRange!);
    console.log(`Validated date range: ${theStart} to ${theEnd}`);

    // Parse and validate run days
    const run_days = validateRunDays(data.daysCommaSeparated!);
    console.log(`Validated run days: ${run_days.join(', ')}`);

    // Read PV information
    const pvInformation = readPVInformation();
    console.log(`Read ${pvInformation.length} PV information records`);

    // Process the days
    await processDays(run_days, theStart, theEnd);

    // Render and create/update the final page with attachments
    await renderAndUpdatePage(data, run_days);

  } catch (error) {
    console.error('Error in data validation phase:', error);
    throw error;
  }
}

// Separate function to process days
async function processDays(run_days: number[], theStart: string, theEnd: string): Promise<void> {
  console.log('>>> 3) Processing each day separately...');
  
  if (PVS.length === 0) {
    throw new Error('No PVs configured in PVS array.');
  }

  if (run_days && run_days.length > 0) {
    try {
      // Extract month and year from the date range
      const startDate = new Date(theStart);
      const year = startDate.getFullYear();
      const month = startDate.getMonth() + 1; // getMonth() returns 0-11, so add 1
      
      // Validate that the year is reasonable
      if (year < 2000 || year > 2100) {
        throw new Error(`Invalid year: ${year}. Year must be between 2000 and 2100`);
      }
      
      // Validate that the month is valid
      if (month < 1 || month > 12) {
        throw new Error(`Invalid month: ${month}. Month must be between 1 and 12`);
      }
      
      console.log(` Processing days for ${year}-${month.toString().padStart(2, '0')}`);
      console.log(` Days to process: ${run_days.join(', ')}`);

      // Validate that all days are valid for the given month
      const daysInMonth = new Date(year, month, 0).getDate();
      const invalidDays = run_days.filter(day => day < 1 || day > daysInMonth);
      if (invalidDays.length > 0) {
        throw new Error(`Invalid days for ${year}-${month.toString().padStart(2, '0')}: ${invalidDays.join(', ')}. Month has ${daysInMonth} days`);
      }

      for (const day of run_days) {
        try {
          console.log(`\n Processing Day ${day}...`);
          
          // Create the full date for this specific day
          const dayDate = new Date(year, month - 1, day+1);
          const dayString = dayDate.toISOString().split('T')[0]; // Get YYYY-MM-DD format
          
          console.log(` Day ${day} date: ${dayString}`);
          
          // Get data for this specific day
          console.log(` Fetching data for day ${day}...`);
          for (const pv of PVS) {
            try {
              const pemPath = './geant_issue.pem';
              const safeName = pv.replace(/[^a-zA-Z0-9-_\.]/g, '_');
              const outputFile = `./data/day_${day}_${safeName}.csv`;
              
              // Check if PEM file exists
              if (!fs.existsSync(pemPath)) {
                throw new Error(`PEM certificate file not found: ${pemPath}`);
              }
              
              await getData({ pv, theDay: dayString!, outputFile, pemPath, rejectUnauthorized: false });
              console.log(` Data fetched for PV: ${pv}`);
            } catch (error) {
              console.error(` Failed to fetch data for PV ${pv}:`, error);
              throw new Error(`Failed to fetch data for PV ${pv}: ${error}`);
            }
          }
          
          // Create rundata.json for this day
          console.log(`Creating rundata.json for day ${day}...`);
          try {
            await rundataCreation(PVS, `day_${day}_`);
            console.log(`Rundata created for day ${day}`);
          } catch (error) {
            console.error(` Failed to create rundata for day ${day}:`, error);
            throw new Error(`Failed to create rundata for day ${day}: ${error}`);
          }
          
          // Generate charts for this day
          console.log(` Generating charts for day ${day}...`);
          try {
            await userRunCode.generateCharts([day], `day_${day}_`);
            console.log(` Charts generated for day ${day}`);
          } catch (error) {
            console.error(` Failed to generate charts for day ${day}:`, error);
            throw new Error(`Failed to generate charts for day ${day}: ${error}`);
          }
          
          console.log(` Day ${day} processing complete!`);
        } catch (error) {
          console.error(`Error processing day ${day}:`, error);
          throw new Error(`Failed to process day ${day}: ${error}`);
        }
      }
      
      console.log('\n All days processed successfully!');
    } catch (error) {
      console.error(' Error in day processing phase:', error);
      throw error;
    }
  } else {
    console.log('No run days specified, skipping processing');
  }
}

// Function to render EJS template and create/update the final page with attachments
async function renderAndUpdatePage(data: Record<string, string>, run_days: number[]): Promise<void> {
  const ejsTemplatePath = './templates/putPageContent.ejs';
  const renderedOutputPath = './templates/ejsRender.html';
  
  try {
    console.log('>>> 4) Searching for existing page...');
    const title = data.title;
    const spaceKey = 'CS';
    const parentId = 1612939516;
    
    if (!title) {
      throw new Error('Page title is required but not found in data');
    }

    let page: any;
    try {
      page = await searchPage(title, spaceKey, parentId);
    } catch (error) {
      throw new Error(`Failed to search for existing page: ${error}`);
    }

    let newPageId: number;
    if (page) {
      console.log(`Page exists, will update id ${page.id}...`);
      newPageId = Number(page.id);
    } else {
      console.log('Page does not exist, will create...');
      try {
        const newPage = await createPage(spaceKey, title, 'Temporary content', parentId);
        if (!newPage) {
          throw new Error('Failed to create new page');
        }
        newPageId = Number(newPage.id);
        console.log(`New page created with ID: ${newPageId}`);
      } catch (error) {
        throw new Error(`Failed to create page: ${error}`);
      }
    }

    console.log('>>> 5) Uploading image attachments...');
    
    // Upload all images as attachments
    const uploadedAttachments: string[] = [];
    
    for (const day of run_days) {
      const dayStr = day.toString();
      
      const attachments = [
        { path: `./visualization/day${day}_power_day_.png`, filename: `day${day}_power_day_.png` },
        { path: `./visualization/day${day}_NF_C91.png`, filename: `day${day}_NF_C91.png` },
        { path: `./visualization/day${day}_FF_C92.png`, filename: `day${day}_FF_C92.png` }
      ];
      
      for (const att of attachments) {
        if (fs.existsSync(att.path)) {
          try {
            await uploadAttachment(newPageId, att.path, att.filename);
            uploadedAttachments.push(att.filename);
            console.log(`Uploaded ${att.filename}`);
            
            // Add a small delay to ensure Confluence processes the attachment
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (error) {
            console.warn(`Failed to upload ${att.filename}:`, error);
          }
        } else {
          console.warn(`Missing file: ${att.path}`);
        }
      }
    }
    
    console.log(`All attachments uploaded successfully: ${uploadedAttachments.join(', ')}`);
    
    // Add a delay to ensure all attachments are processed by Confluence
    console.log('>>> Waiting for Confluence to process attachments...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('>>> 6) Rendering EJS template with attachment references...');

    // Read PV information
    const allPVInformation = readPVInformation();
    const pvInformation = allPVInformation.filter(pv => PVS.includes(pv.pv));
    console.log(`Loaded ${allPVInformation.length} total PV definitions from CSV`);
    
    // Merge Confluence data with template data - now using attachment references
    const mergedData = {
      ...data,  // All the data from Confluence page (title, userCampaign, dateRange, etc.)
      pvInformation: pvInformation,
      days: run_days.map(day => ({
        number: day.toString(),
        // Images are now uploaded as attachments, reference the filenames
        graphUrl: `day${day}_power_day_.png`,
        nearFieldProfileGraph: `day${day}_NF_C91.png`,
        farFieldProfileGraph: `day${day}_FF_C92.png`
      }))
    };

    console.log('Merged data for template:', JSON.stringify(mergedData, null, 2));

    // Read and render the EJS template
    let template: string;
    try {
      template = readFileSync(ejsTemplatePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read EJS template: ${ejsTemplatePath}. Error: ${error}`);
    }

    let rendered: string;
    try {
      rendered = ejs.render(template, mergedData);
      console.log('EJS template rendered successfully');
      
      // Debug: Log a sample of the rendered content to check attachment syntax
      const sampleMatch = rendered.match(/<ac:image[^>]*>[\s\S]*?<\/ac:image>/);
      if (sampleMatch) {
        console.log('Sample rendered image tag:', sampleMatch[0]);
      }
    } catch (error) {
      throw new Error(`Failed to render EJS template: ${error}`);
    }

    // Write rendered content to file
    try {
      writeFileSync(renderedOutputPath, rendered, 'utf-8');
      console.log('EJS template written to file successfully');
    } catch (error) {
      throw new Error(`Failed to write rendered output: ${error}`);
    }

    console.log('>>> 7) Updating page with rendered content...');
    
    try {
      await updatePage(newPageId, title, rendered);
      console.log('Page updated successfully with attachments');
    } catch (error) {
      throw new Error(`Failed to update page: ${error}`);
    }

    console.log(' Page rendering and update complete!');
  } catch (error) {
    console.error('Error in page rendering phase:', error);
    throw error;
  }
}

  
// Main execution with comprehensive error handling
run().catch((err) => {
  console.error('\n Fatal error occurred during execution:');
  console.error('=====================================');
  
  if (err instanceof Error) {
    console.error(`Error Type: ${err.constructor.name}`);
    console.error(`Error Message: ${err.message}`);
    if (err.stack) {
      console.error(`Stack Trace:\n${err.stack}`);
    }
  } else {
    console.error('Unknown error:', err);
  }
  
  console.error('\n💡 Troubleshooting tips:');
  console.error('- Check that the Confluence page contains all required fields (pvs, dateRange, daysCommaSeparated, title)');
  console.error('- Verify that the PEM certificate file exists at ./geant_issue.pem');
  console.error('- Ensure the data directory exists and is writable');
  console.error('- Check network connectivity for API calls');
  console.error('- Verify that all PV names are valid and accessible');
  console.error('- Ensure the EJS template file exists at ./templates/putPageContent.ejs');
  console.error('- Check that visualization images are generated in ./visualization/ directory');
  console.error('- Verify Confluence permissions for page creation/updates');
  
  process.exitCode = 1;
});

// const id = 1754595366;
// getPage(id, './templates/theTemplate.html');