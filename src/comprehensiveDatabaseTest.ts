import { tryDatabaseApproaches } from './api/getDatabase.js';
import { tryAdvancedDatabaseAccess } from './api/advancedDatabaseAccess.js';

async function runComprehensiveDatabaseTest(databaseId: number): Promise<void> {
    console.log("🚀 Starting Comprehensive Database Access Test");
    console.log("=" .repeat(60));
    console.log(`Target Database ID: ${databaseId}`);
    console.log("=" .repeat(60));
    
    try {
        // Phase 1: Basic approaches
        console.log("\n📋 Phase 1: Basic Database Access Approaches");
        console.log("-" .repeat(50));
        await tryDatabaseApproaches(databaseId);
        
        // Phase 2: Advanced approaches
        console.log("\n🔬 Phase 2: Advanced Database Access Approaches");
        console.log("-" .repeat(50));
        await tryAdvancedDatabaseAccess(databaseId);
        
        console.log("\n✅ All database access attempts completed!");
        console.log("\n📁 Check the generated files for results:");
        console.log("   - HTML content files (*.html)");
        console.log("   - JSON data files (*.json)");
        console.log("   - API response files (*.json)");
        
    } catch (error) {
        console.error("\n❌ Error during comprehensive test:", error);
    }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
    // Get database ID from command line argument or use default
    const databaseId = process.argv[2] ? parseInt(process.argv[2]) : 12345;
    
    if (isNaN(databaseId)) {
        console.error("❌ Invalid database ID. Please provide a valid number.");
        console.log("Usage: npm run test:database <database_id>");
        process.exit(1);
    }
    
    runComprehensiveDatabaseTest(databaseId)
        .then(() => {
            console.log("\n🎉 Test completed successfully!");
            process.exit(0);
        })
        .catch((error) => {
            console.error("\n💥 Test failed:", error);
            process.exit(1);
        });
}

export { runComprehensiveDatabaseTest };


