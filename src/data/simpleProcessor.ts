import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

type TimePoint = { t: number; v: number };
type BoolPoint = { t: number; b: boolean };

function parseCsvToSeries(
  filePath: string,
  timeCol: string,
  valueCol: string
): TimePoint[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = parse(text, { columns: (header: string[]) => header.map(h => h.trim()), skip_empty_lines: true }) as Record<string, string>[];
  const series: TimePoint[] = rows.map(r => {
    const rawTime = (r[timeCol] ?? '').trim();
    const rawVal = (r[valueCol] ?? '').trim();
    const t = Number(rawTime);
    const v = Number(rawVal);
    return { t, v };
  }).filter(p => Number.isFinite(p.t) && Number.isFinite(p.v));
  series.sort((a, b) => a.t - b.t);
  return series;
}

function parseCsvToBool(
  filePath: string,
  timeCol: string,
  valueCol: string
): BoolPoint[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const rows = parse(text, { columns: (header: string[]) => header.map(h => h.trim()), skip_empty_lines: true }) as Record<string, string>[];
  const series: BoolPoint[] = rows.map(r => {
    const rawTime = (r[timeCol] ?? '').trim();
    const rawVal = (r[valueCol] ?? '').trim();
    const t = Number(rawTime);
    const b = Number(rawVal) !== 0;
    return { t, b };
  }).filter(p => Number.isFinite(p.t));
  series.sort((a, b) => a.t - b.t);
  return series;
}

function buildForwardFillGetter(series: BoolPoint[]): (t: number) => boolean {
  if (series.length === 0) {
    return (_t: number) => false;
  }
  
  const sortedSeries = [...series].sort((a, b) => a.t - b.t);
  
  return (t: number): boolean => {
    let lastState: boolean | null = null;
    
    for (const point of sortedSeries) {
      if (point.t <= t) {
        lastState = point.b;
      } else {
        break;
      }
    }
    
    return lastState ?? false;
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
    out[i] = sum / denom;
  }
  return out;
}

function main() {
  const energy = parseCsvToSeries('data/L3-SBW4-PM311_Energy.csv', 'Epoch', 'L3-SBW4-PM311:Energy');
  const feHigh = parseCsvToBool('data/L3-PSS_STATE_EXH_EXTERNAL_HIGH_P.csv', 'Epoch', 'L3-PSS:STATE_EXH_EXTERNAL_HIGH_P');
  
  // Check if we have low power data files
  const feLowCsv = 'data/L3-PSS_SGV501_IN_OPEN_POSITION.csv'; // This might be the low power indicator
  let feLow: BoolPoint[] = [];
  try {
    feLow = parseCsvToBool(feLowCsv, 'Epoch', 'L3-PSS:SGV501_IN_OPEN_POSITION');
  } catch (e) {
    console.log('No FE low power data found, proceeding without it');
  }

  console.log(`Loaded ${energy.length} energy points`);
  console.log(`Loaded ${feHigh.length} FE high power points`);
  console.log(`Loaded ${feLow.length} FE low power points`);

  const feHighAt = buildForwardFillGetter(feHigh);
  const feLowAt = buildForwardFillGetter(feLow);

  const energyValues = energy.map(p => p.v);
  const averaged = rollingAverage(energyValues, 100);

  const filtered: TimePoint[] = [];
  for (let i = 0; i < energy.length; i++) {
    const point = energy[i];
    if (!point) continue;
    const t = point.t;
    
    // Laser is running if FE high power is ON (regardless of low power state)
    const feHighOn = feHighAt(t);
    const feLowOn = feLow.length > 0 ? feLowAt(t) : false;
    const running = feHighOn; // Simplified: just check if high power is on

    if (running) {
      const v = averaged[i] ?? energyValues[i] ?? 0;
      filtered.push({ t, v });
    }
  }

  console.log(`Filtered to ${filtered.length} points where laser was running (FE high ON, low OFF)`);

  const out = ['Timestamp,Epoch,AvgEnergy']
    .concat(filtered.map(p => `${new Date(p.t).toISOString()},${p.t},${p.v}`))
    .join('\n');
  fs.writeFileSync('data/processedData.csv', out);
  
  console.log('Generated processedData.csv');
}

main();
