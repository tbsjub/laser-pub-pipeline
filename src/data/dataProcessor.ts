import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

type TimePoint = { t: number; v: number };
type BoolPoint = { t: number; b: boolean };

function parseCsvToSeries(
  filePath: string,
  timeCol: string,
  valueCol: string,
  valueToNumber?: (raw: string) => number
): TimePoint[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = parse(text, { columns: (header: string[]) => header.map(h => h.trim()), skip_empty_lines: true }) as Record<string, string>[];
  const series: TimePoint[] = rows.map(r => {
    const rawTime = (r[timeCol] ?? '').trim();
    const rawVal = (r[valueCol] ?? '').trim();
    const t = parseTimestamp(rawTime);
    const v = valueToNumber ? valueToNumber(rawVal) : Number(rawVal);
    return { t, v };
  }).filter(p => Number.isFinite(p.t) && Number.isFinite(p.v));
  series.sort((a, b) => a.t - b.t);
  return series;
}

function parseCsvToBool(
  filePath: string,
  timeCol: string,
  valueCol: string,
  valueToBool: (raw: string) => boolean
): BoolPoint[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = parse(text, { columns: (header: string[]) => header.map(h => h.trim()), skip_empty_lines: true }) as Record<string, string>[];
  const series: BoolPoint[] = rows.map(r => {
    const rawTime = (r[timeCol] ?? '').trim();
    const rawVal = (r[valueCol] ?? '').trim();
    const t = parseTimestamp(rawTime);
    const b = valueToBool(rawVal);
    return { t, b };
  }).filter(p => Number.isFinite(p.t));
  series.sort((a, b) => a.t - b.t);
  return series;
}

function parseTimestamp(raw: string): number {
  // Adjust if your timestamps are numeric seconds or have timezone differences
  const num = Number(raw);
  if (Number.isFinite(num)) {
    // If your CSV stores UNIX seconds, convert to ms:
    return num > 1e12 ? num : Math.round(num * 1000);
  }
  const t = Date.parse(raw);
  return t; // NaN if unparsable
}

function buildForwardFillGetter(series: BoolPoint[], toleranceMs: number) {
  if (series.length === 0) {
    return (_t: number) => false;
  }
  
  // Sort by time to ensure proper order
  const sortedSeries = [...series].sort((a, b) => a.t - b.t);
  
  return (t: number): boolean => {
    // Find the most recent state at or before time t
    let lastState: boolean | null = null;
    
    for (const point of sortedSeries) {
      if (point.t <= t) {
        lastState = point.b;
      } else {
        break;
      }
    }
    
    // If no state found, return false
    if (lastState === null) return false;
    
    return lastState;
  };
}

function rollingAverage(values: number[], windowSize: number): number[] {
  const out: number[] = new Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const current = values[i] ?? 0;
    sum += current;
    if (i >= windowSize) {
      const subtract = values[i - windowSize] ?? 0;
      sum -= subtract;
    }
    const denom = i + 1 < windowSize ? i + 1 : windowSize;
    out[i] = sum / denom; // trailing average
  }
  return out;
}

// ---- Configure these for your files ----
const energyCsv = 'data/L3-SBW4-PM311_Energy.csv';
const energyTimeCol = 'Epoch';
const energyValCol = 'L3-SBW4-PM311:Energy';

const shutterCsv = 'data/L3BT-VCS-SGV505_OPEN.csv';
const shutterTimeCol = 'Epoch';
const shutterValCol = 'L3BT-VCS-SGV505:OPEN';

const feHighCsv = 'data/L3-PSS_STATE_EXH_EXTERNAL_HIGH_P.csv';
const feHighTimeCol = 'Epoch';
const feHighValCol = 'L3-PSS:STATE_EXH_EXTERNAL_HIGH_P';

const feLowCsv = ''; // if you have LOW power CSV, set path here
const feLowTimeCol = 'Epoch';
const feLowValCol = 'value';

const blHighCsv = '';
const blHighTimeCol = 'Epoch';
const blHighValCol = 'value';

const blLowCsv = '';
const blLowTimeCol = 'Epoch';
const blLowValCol = 'value';

// Map raw state strings/numbers to boolean
const truthy = new Set(['1','true','TRUE','open','OPEN','HIGH','HIGH_POWER','ON']);
const falsy  = new Set(['0','false','FALSE','closed','CLOSED','LOW','LOW_POWER','OFF']);
const toBool = (s: string) => {
  const trimmed = String(s).trim();
  if (truthy.has(trimmed)) return true;
  if (falsy.has(trimmed)) return false;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n !== 0 : false;
};

function main() {
  const energy = parseCsvToSeries(energyCsv, energyTimeCol, energyValCol);
  const shutter = parseCsvToBool(shutterCsv, shutterTimeCol, shutterValCol, toBool);

  const feHigh = feHighCsv ? parseCsvToBool(feHighCsv, feHighTimeCol, feHighValCol, toBool) : [];
  const feLow  = feLowCsv  ? parseCsvToBool(feLowCsv,  feLowTimeCol,  feLowValCol,  toBool) : [];
  const blHigh = blHighCsv ? parseCsvToBool(blHighCsv, blHighTimeCol, blHighValCol, toBool) : [];
  const blLow  = blLowCsv  ? parseCsvToBool(blLowCsv,  blLowTimeCol,  blLowValCol,  toBool) : [];


  


  const toleranceMs = 30000; // increase tolerance to handle sparse state updates
  const shutterAt = buildForwardFillGetter(shutter, toleranceMs);
  const feHighAt = buildForwardFillGetter(feHigh, toleranceMs);
  const feLowAt  = buildForwardFillGetter(feLow, toleranceMs);
  const blHighAt = buildForwardFillGetter(blHigh, toleranceMs);
  const blLowAt  = buildForwardFillGetter(blLow, toleranceMs);

  const energyValues = energy.map(p => p.v);
  const averaged = rollingAverage(energyValues, 100);

  const filtered: TimePoint[] = [];

  for (let i = 0; i < energy.length; i++) {
    const point = energy[i];
    if (!point) continue;
    const t = point.t;
    const anyHigh = (feHigh.length ? feHighAt(t) : false) || (blHigh.length ? blHighAt(t) : false);
    const anyLow  = (feLow.length ? feLowAt(t) : false) || (blLow.length ? blLowAt(t) : false);
    // Simplified: laser is running if shutter is open
    const running = shutterAt(t);


      const shutterState = shutterAt(t);
      console.log(`Point ${i}: t=${new Date(t).toISOString()}, anyHigh=${anyHigh}, anyLow=${anyLow}, shutter=${shutterState}, running=${running}`);
      
      // Debug the forward-fill function directly
      if (debugCount === 0) {
        console.log(`Debugging forward-fill for time ${t}:`);
        console.log(`Shutter data points: ${shutter.length}`);
        console.log(`First shutter time: ${shutter[0] ? new Date(shutter[0].t).toISOString() : 'none'}`);
        console.log(`Last shutter time: ${shutter.length > 0 ? new Date(shutter[shutter.length-1]!.t).toISOString() : 'none'}`);
        
        // Find the most recent shutter state before this time
        let foundState = false;
        for (const s of shutter) {
          if (s.t <= t) {
            const age = Math.abs(t - s.t);
            console.log(`  Shutter at ${new Date(s.t).toISOString()} (age: ${age}ms): ${s.b}`);
            if (age <= 30000) {
              console.log(`    -> Within tolerance, should return ${s.b}`);
              foundState = true;
            }
          }
        }
        if (!foundState) console.log(`  No shutter state found within tolerance`);
      }
      
      debugCount++;
    }

    if (running) {
      const v = (averaged[i] ?? energyValues[i] ?? null);
      if (v !== null) {
        filtered.push({ t, v });
      }
    }
  }

  // Example: write filtered output (or plot it)
  const out = ['Timestamp,Epoch,AvgEnergy']
    .concat(filtered.map(p => `${new Date(p.t).toISOString()},${p.t},${p.v}`))
    .join('\n');
  fs.writeFileSync('data/processedData.csv', out);
}

main();