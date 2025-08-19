import createPage from './api/createPage.js';
import getPage from './api/getPage.js';
import parseTable from './data/htmlToJSON.js';
import updatePage from './api/updatePage.js';
import { readFileSync, writeFileSync } from 'fs';
import ejs from 'ejs';

// createPage('CS', 'type script', 'This is a test page', 1616445503);
const pageId = 1682210847;
// const template = readFileSync('./templates/putPageContent.ejs', 'utf-8');
// const rendered = ejs.render(template, {})
const newTitle = 'The SHOT';

// Async function to handle the updatePage call
async function main() {
  try {
    await updatePage(pageId, newTitle, { 
      template: './templates/putPageContent.ejs', 
      data: {title: "Test"} 
    });
  }
}

// Run the main function
main();

// const template = readFileSync('./templates/putPageContent.ejs', 'utf-8');
// const rendered = ejs.render(template, {title: null}); // {} = your data object
// writeFileSync('./ejsRender.html', rendered, 'utf-8');
