import fs from 'fs';
import { parse } from 'csv-parse/sync';
import path from 'path';

// Default PVS array (can be overridden by function parameter)
const DEFAULT_PVS: string[] = [
  "L1-ALFA-SHU01-61:Out",
  "L1-OPA3-5_2-PM98:VAL_CAL",
  "L1-OPA4-PM21:VAL_CAL",
  "L1-CMP-C91:CentroidX",
  "L1-CMP-C91:CentroidY",
  "L1-CMP-C92:CentroidX",
  "L1-CMP-C92:CentroidY"
];

// 🔧 Normalize PV name → "L1OPA35_2PM98VAL_CALValue"
function normalizePVName(pv: string): string {
  return pv.replace(/[^a-zA-Z0-9]/g, '') + "Value";
}

// Define types for data structure
interface DataPoint {
  time: Date;
  value: number;
}

interface AllData {
  [pv: string]: DataPoint[];
}

interface JSONOutput {
  Time: string[];
  [key: string]: string[] | (number | '')[];
}

// 1️⃣ Load CSV
function loadCSV(pv: string, filePrefix: string = ''): DataPoint[] {
  const safeName: string = pv.replace(/[^a-zA-Z0-9-_\.]/g, '_');
  const filePath: string = path.join('./data', `${filePrefix}${safeName}.csv`);
  if (!fs.existsSync(filePath)) return [];

  const text: string = fs.readFileSync(filePath, 'utf8');
  const rows: Record<string, string>[] = parse(text, { columns: true, skip_empty_lines: true });
  if (rows.length === 0) return [];
  
  const pvColumn: string | undefined = Object.keys(rows[0]!).find(
    (k: string): boolean => k !== 'Timestamp' && !/^epoch$/i.test(k.trim())
  );
  if (!pvColumn) throw new Error(`PV column not found in ${pv}. Available columns: ${Object.keys(rows[0]!).join(', ')}`);

  return rows
    .map((r: Record<string, string>): DataPoint => ({
      time: new Date(r.Timestamp || ''),
      value: Number(r[pvColumn]) || 0
    }))
    .filter((d: DataPoint): boolean => !isNaN(d.value) && !isNaN(d.time.getTime()));
}

// 2️⃣ Build 1Hz timeline (modified to align to whole seconds)
function build1HzTimeline(allData: AllData): Date[] {
  let minTime: number = Infinity;
  let maxTime: number = -Infinity;

  for (const arr of Object.values(allData)) {
    if (arr.length === 0) continue;
    minTime = Math.min(minTime, arr[0]!.time.getTime());
    maxTime = Math.max(maxTime, arr[arr.length - 1]!.time.getTime());
  }

  // Floor minTime to the start of the second
  minTime = Math.floor(minTime / 1000) * 1000;
  // Ceil maxTime to the end of the second
  maxTime = Math.ceil(maxTime / 1000) * 1000;

  const timeline: Date[] = [];
  for (let t: number = minTime; t <= maxTime; t += 1000) {
    timeline.push(new Date(t));
  }
  return timeline;
}

// 3️⃣ Align to 1Hz timeline (modified to average within [t, t+1000ms) window)
function alignData(masterTime: Date[], allData: AllData): JSONOutput {
  const result: JSONOutput = { Time: [], ...Object.keys(allData).reduce((acc: Record<string, (number | '')[]>, pv: string) => ({
    ...acc,
    [normalizePVName(pv)]: []
  }), {}) };
  
  const indices: Record<string, number> = {};
  const previousVals: Record<string, number | ''> = {}; // Track previous average per PV for holding in gaps
  for (const pv of Object.keys(allData)) {
    indices[pv] = 0;
    previousVals[pv] = '';
  }

  for (const t of masterTime) {
    result.Time.push(t.toISOString().replace('Z', '')); // Format as "YYYY-MM-DD HH:mm:ss.sss"
    
    for (const pv of Object.keys(allData)) {
      const arr: DataPoint[] | undefined = allData[pv];
      const normalizedPV: string = normalizePVName(pv);
      
      if (!arr || arr.length === 0) {
        (result[normalizedPV] as (number | '')[]).push('');
        continue;
      }

      // If t is before the first data point, output ''
      if (t < arr[0]!.time) {
        (result[normalizedPV] as (number | '')[]).push('');
        continue;
      }

      // Collect and average values in [t, t+1000ms)
      let sum: number = 0;
      let count: number = 0;
      let j: number = indices[pv]!;
      const nextT = new Date(t.getTime() + 1000);
      while (j < arr.length && arr[j]!.time < nextT) {
        if (arr[j]!.time >= t) {
          sum += arr[j]!.value;
          count++;
        }
        j++;
      }
      indices[pv] = j; // Advance index to first point after the window

      let val: number | '' = previousVals[pv]!;
      if (count > 0) {
        val = sum / count;
        previousVals[pv] = val; // Update previous for future gaps
      }
      (result[normalizedPV] as (number | '')[]).push(val);
    }
  }
  
  return result;
}

// 4️⃣ Main function
export default async function rundataCreation(pvs: string[] = DEFAULT_PVS, filePrefix: string = ''): Promise<void> {
  console.log('📊 Loading CSV files...');
  const allData: AllData = {};
  for (const pv of pvs) {
    allData[pv] = loadCSV(pv, filePrefix);
    console.log(`  ✅ ${pv}: ${allData[pv].length} points`);
  }

  console.log('🔄 Building 1Hz timeline...');
  const masterTime: Date[] = build1HzTimeline(allData);

  console.log('🔄 Aligning data...');
  const jsonOutput: JSONOutput = alignData(masterTime, allData);

  console.log('📝 Writing JSON file...');
  const outputFile = filePrefix ? `./data/${filePrefix}rundata.json` : './data/rundata.json';
  fs.writeFileSync(outputFile, JSON.stringify(jsonOutput, null, 2));
  console.log(`✅ ${outputFile} created!`);
}