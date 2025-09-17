import fs from 'fs';
import moment from 'moment';

// Load the data
const rundata = JSON.parse(fs.readFileSync('./data/rundata.json', 'utf8'));

// Convert shutter values to numbers
const shutter_numeric = rundata.L1ALFASHU0161OutValue.map(v => {
    if (v === '' || v === null || v === undefined) return 0;
    return Number(v) || 0;
});

// Check the run days being processed
const run_days = [1, 2, 7, 8, 10, 12];

console.log('=== SHUTTER ANALYSIS FOR RUN DAYS ===');
console.log('Run days:', run_days);

for (const run_day of run_days) {
    console.log(`\n--- Day ${run_day} ---`);
    
    let shutterOpenCount = 0;
    let shutterClosedCount = 0;
    let totalDataPoints = 0;
    
    for (let i = 0; i < rundata.Time.length; i++) {
        const t = moment(rundata.Time[i]);
        if (t.date() === run_day) {
            totalDataPoints++;
            if (shutter_numeric[i] === 1) {
                shutterOpenCount++;
            } else {
                shutterClosedCount++;
            }
        }
    }
    
    console.log(`Total data points: ${totalDataPoints}`);
    console.log(`Shutter open (1): ${shutterOpenCount}`);
    console.log(`Shutter closed (0): ${shutterClosedCount}`);
    console.log(`Percentage open: ${totalDataPoints > 0 ? (shutterOpenCount / totalDataPoints * 100).toFixed(2) : 0}%`);
    
    // Show first few timestamps for this day
    console.log('First few timestamps:');
    let count = 0;
    for (let i = 0; i < rundata.Time.length && count < 5; i++) {
        const t = moment(rundata.Time[i]);
        if (t.date() === run_day) {
            console.log(`  ${rundata.Time[i]} (shutter: ${shutter_numeric[i]})`);
            count++;
        }
    }
}

// Check overall shutter distribution
console.log('\n=== OVERALL SHUTTER DISTRIBUTION ===');
const ones = shutter_numeric.filter(v => v === 1).length;
const zeros = shutter_numeric.filter(v => v === 0).length;
console.log(`Total 1s: ${ones}`);
console.log(`Total 0s: ${zeros}`);
console.log(`Percentage 1s: ${(ones / shutter_numeric.length * 100).toFixed(2)}%`);
