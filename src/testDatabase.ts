import { tryDatabaseApproaches } from './api/getDatabase.js';

// Test with a sample database ID
// Replace this with your actual database page ID
const databaseId = 12345; // Replace with your actual database page ID

console.log("Testing different approaches to access Confluence database...");
console.log("Database ID:", databaseId);

tryDatabaseApproaches(databaseId)
    .then(() => {
        console.log("\nAll approaches completed. Check the generated files for results.");
    })
    .catch((error) => {
        console.error("Error during testing:", error);
    });

