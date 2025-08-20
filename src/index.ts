import createPage from './api/createPage.js';
import getPage from './api/getPage.js';
import parseTable from './data/htmlToJSON.js';
import updatePage from './api/updatePage.js';
import getData from './api/getData.js'
import { readFileSync, writeFileSync } from 'fs';
import ejs from 'ejs';
import { spaceKey } from './config/confluenceConfig.js';

// // createPage('CS', 'type script', 'This is a test page', 1616445503);
// const pageId = 1682210847;
// // const template = readFileSync('./templates/putPageContent.ejs', 'utf-8');
// // const rendered = ejs.render(template, {})
// const newTitle = 'The SHOT';

// // const template = readFileSync('./templates/putPageContent.ejs', 'utf-8');
// // const rendered = ejs.render(template, {title: null}); // {} = your data object
// // writeFileSync('./ejsRender.html', rendered, 'utf-8');




// const pv = "L3-PSS:STATE_EXH_EXTERNAL_HIGH_P";
// const timeSpan = "1d";
// const outputFile = "data/csvFile.csv";
// const pemPath = "c://Users//sarita.pokhrel//Downloads//geant_issue.pem";


// getData({pv, timeSpan, outputFile, pemPath});


const rawId = 1687519372;
const pagePath = "./templates/getPageContent.html";
getPage(rawId, pagePath);
const data = parseTable(pagePath);
console.log(data);
// const template = readFileSync('.templates/putPageContent.ejs');
// const rendered = ejs.render(template, {});
// writeFileSync('./templates/ejsRender.html', rendered, 'utf-8');
// createPage(spaceKey, "Shot template", './templates/ejsRender.html', rawId);

