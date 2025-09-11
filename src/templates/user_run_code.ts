import * as fs from 'fs';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { Chart, registerables } from 'chart.js';
import type { ChartConfiguration } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import moment from 'moment';

import 'chartjs-adapter-moment';

Chart.register(...registerables, annotationPlugin);

// set locale once
moment.locale('en');

// Interface for rundata (adjust based on actual JSON structure)
interface RunData {
    Time: string[];
    L1ALFASHU0161OutValue: number[];
    L1OPA352PM98VAL_CALValue: number[];
    L1OPA4PM21VALCALValue: number[];
    L1CMPC91CentroidXValue: number[];
    L1CMPC91CentroidYValue: number[];
    L1CMPC92CentroidXValue: number[];
    L1CMPC92CentroidYValue: number[];
}

// Function to add hours to a Moment object
function addHours(date: moment.Moment, hours: number): moment.Moment {
    return date.clone().add(hours, 'hours');
}

function movmean(arr: number[], window: number): number[] {
    const n = arr.length;
    const result = new Array(n).fill(0);
    let sum = 0;

    for (let i = 0; i < n; i++) {
        sum += arr[i] || 0;
        if (i >= window) {
            sum -= arr[i - window] || 0;
        }
        result[i] = sum / Math.min(i + 1, window);
    }
    return result;
}



// Moving std function
function movstd(arr: number[], window: number): number[] {
    const n = arr.length;
    const result = new Array(n).fill(0);
    let sum = 0;
    let sumSq = 0;

    for (let i = 0; i < n; i++) {
        const val = arr[i] || 0;
        sum += val;
        sumSq += val * val;

        if (i >= window) {
            const oldVal = arr[i - window] || 0;
            sum -= oldVal;
            sumSq -= oldVal * oldVal;
        }

        const count = Math.min(i + 1, window);
        const mean = sum / count;
        const variance = sumSq / count - mean * mean;
        result[i] = Math.sqrt(Math.max(variance, 0)); // clamp to avoid NaN from float errors
    }
    return result;
}

// Initialize ChartJSNodeCanvas
const canvasRenderService = new ChartJSNodeCanvas({ width: 800, height: 600 });

// Function to save chart to PNG
async function saveChart(config: any, filename: string): Promise<void> {
    const buffer = await canvasRenderService.renderToBuffer(config);
    fs.writeFileSync(filename, buffer);
}

// Main function
export default async function userRunData(run_days: number[] = [3, 4]): Promise<void> {
    // Load rundata from JSON
    const rundataRaw = fs.readFileSync('./data/rundata.json', 'utf8');
    const rundata: Record<string, any[]> = JSON.parse(rundataRaw);
    
    if (!rundata.Time || !Array.isArray(rundata.Time)) {
        throw new Error('Invalid rundata: Time array not found');
    }
    
    const rundataTime_length = rundata.Time.length;

    const pixel = 0.4e-6; // m (1pixel = 4um with 10x mag)
    const lens = 0.5; // m
    const aim = 10; // microrad

    const t_start = moment(rundata.Time[0]!);
    const t_end = moment(rundata.Time[rundataTime_length - 1]!);
    const year = t_start.year();
    const mon = t_start.month() + 1; // Moment months are 0-indexed
    const day = t_start.date();
    const openHour = 7; // hour that the measurement starts from
    const closedHour = 21; // hour that the measurement shuts down
    const d = run_days.length; // number of desired subplots
    const high_power = 40; // power level for "high power"
    const added_time = 0; // time difference between GMT and local time

    // Creating datasets for specific conditions (power, shutter etc)
    let index_new: number[] = [];
    const shutter_val = rundata.L1ALFASHU0161OutValue || [];

    for (const run_day of run_days) {
        for (let i = 0; i < rundataTime_length; i++) {
            const t = moment(rundata.Time[i]!);
            if (t.date() === run_day) {
                index_new.push(i);
            }
        }
    }

// Add this debugging code:
console.log('=== RUNDATA ANALYSIS ===');
Object.keys(rundata).forEach(key => {
    const data = rundata[key];
    if (data && Array.isArray(data)) {
        console.log(`${key}:`);
        console.log(`  - Length: ${data.length}`);
        console.log(`  - Type: ${typeof data}`);
        console.log(`  - First value: ${data[0]}`);
        console.log(`  - Last value: ${data[data.length - 1]}`);
        console.log('---');
    }
});
console.log('========================');

    // Loop creating power graphs indices
    let pwr_index: number[] = [];

    for (const run_day of run_days) {
        for (let i = 0; i < rundataTime_length; i++) {
            const t = moment(rundata.Time[i]!);
            if (t.date() === run_day) {
                pwr_index.push(i);
            }
        }
    }

    // Power calculations
    const power: number[] = pwr_index.map(i => (rundata.L1OPA352PM98VALCALValue?.[i] || 0) * 41 / 34);
    const pwr_time: moment.Moment[] = pwr_index.map(i => addHours(moment(rundata.Time?.[i] || ''), added_time));
    const low_power: number[] = pwr_index.map(i => rundata.L1OPA4PM21VALCALValue?.[i] || 0);

    const shutter_good: number[] = shutter_val.map(v => 1 * (v || 0));
    index_new.forEach(idx => {
        shutter_good[idx] = high_power * (shutter_val[idx] || 0);
    });
    const shutter_low: number[] = shutter_good.map(v => v * (5 / high_power));
    const shutter_med: number[] = shutter_good.map(v => v * (20 / high_power));

    const av_power = movmean(power, 100);
    const av_low_power = movmean(low_power, 100);

    // High power plots, one per day
    for (const run_day of run_days) {
        const day_indices = pwr_index.filter(i => moment(rundata.Time?.[i] || '').date() === run_day);
        const day_pwr_time = day_indices.map(i => pwr_time[pwr_index.indexOf(i)]);
        const day_av_power = day_indices.map(i => av_power[pwr_index.indexOf(i)]);
        const day_shutter_good = day_indices.map(i => shutter_good[i]);
        const day_shutter_low = day_indices.map(i => shutter_low[i]);

            const tStart = moment({ year, month: mon - 1, date: run_day || 1, hour: openHour, minute: 0, second: 0 } as any);
            const tEnd = moment({ year, month: mon - 1, date: run_day || 1, hour: closedHour, minute: 0, second: 0 } as any);

        const config = {
            type: 'line',
            data: {
                datasets: [
                    {
                        label: 'Average Power',
                        data: day_pwr_time.map((t, i) => ({ x: t?.valueOf() || 0, y: day_av_power[i] || 0 })),
                        pointRadius: 3,
                        pointBackgroundColor: '#1f77b4',
                        showLine: false
                    },
                    {
                        label: 'Shutter Good',
                        data: day_pwr_time.map((t, i) => ({ x: t?.valueOf() || 0, y: day_shutter_good[i] || 0 })),
                        borderColor: '#ff7f0e',
                        borderWidth: 2,
                        fill: false,
                        pointRadius: 0
                    },
                    {
                        label: 'Shutter Low',
                        data: day_pwr_time.map((t, i) => ({ x: t?.valueOf() || 0, y: day_shutter_low[i] || 0 })),
                        borderColor: '#2ca02c',
                        borderWidth: 2,
                        fill: false,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Time (hours)' },
                        min: tStart.valueOf(),
                        max: tEnd.valueOf(),
                        ticks: {
                            callback: function(value: any) {
                                return moment(value).format('HH:mm');
                            }
                        }
                    },
                    y: {
                        type: 'linear',
                        title: { display: true, text: 'Energy (mJ)' },
                        min: 0,
                        max: 10
                    }
                },
                plugins: {
                    title: { display: true, text: 'Low power (~5mJ) requested' },
                    legend: { display: true }
                }
            }
        };

        await saveChart(config, `power_day_${run_day}.png`);
        console.log(`Saved power graph for day ${run_day}`);
    }

    // Creating data sets for time, centroid and power
    const x91 = index_new.map(i => rundata.L1CMPC91CentroidXValue?.[i] || 0);
    const y91 = index_new.map(i => rundata.L1CMPC91CentroidYValue?.[i] || 0);
    const x92 = index_new.map(i => rundata.L1CMPC92CentroidXValue?.[i] || 0);
    const y92 = index_new.map(i => rundata.L1CMPC92CentroidYValue?.[i] || 0);
    const new_t = index_new.map(i => addHours(moment(rundata.Time?.[i] || ''), added_time));

    // Calculating values to be plotted
    const dist91 = x91.map((x, i) => Math.sqrt(x ** 2 + y91[i] ** 2));
    const offset91 = dist91.map(d => Math.atan(d * pixel / lens) * 1e6);
    const dist92 = x92.map((x, i) => Math.sqrt(x ** 2 + y92[i] ** 2));
    const offset92 = dist92.map(d => Math.atan(d * pixel / lens) * 1e6);

    const std91 = movstd(dist91, 100000);
    const std92 = movstd(offset92, 100000);

    const xmr91 = x91.map(x => x * pixel * 1e6);
    const ymr91 = y91.map(y => y * pixel * 1e6);
    const xmr92 = x92.map(x => x * pixel * 1e6);
    const ymr92 = y92.map(y => y * pixel * 1e6);

    const x_av91 = movmean(xmr91, 1000);
    const y_av91 = movmean(ymr91, 1000);
    const x_av92 = movmean(xmr92, 1000);
    const y_av92 = movmean(ymr92, 1000);

    // Histogram plot 91 (approximated as scatter with density effect)
    {
        const config = {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'C91 Displacement',
                    data: xmr91.map((x, i) => ({ x, y: ymr91[i] })),
                    backgroundColor: 'rgba(31, 119, 180, 0.5)',
                    pointRadius: 3
                }]
            },
            options: {
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Displacement in x (µm)' },
                        min: x_av91.reduce((min: number, val: number) => Math.min(min, val), Infinity) - 5,
                        max: x_av91.reduce((max: number, val: number) => Math.max(max, val), -Infinity) + 5
                    },
                    y: {
                        type: 'linear',
                        title: { display: true, text: 'Displacement in y (µm)' },
                        min: y_av91.reduce((min: number, val: number) => Math.min(min, val), Infinity) - 5,
                        max: y_av91.reduce((max: number, val: number) => Math.max(max, val), -Infinity) + 5
                    }
                },
                plugins: {
                    title: { display: true, text: 'Near-field centroid displacement (C91)' },
                    legend: { display: false }
                }
            }
        };

        await saveChart(config, 'NF_C91.png');
        console.log('Saved NF_C91.png');
    }

    // Histogram plot 92 (approximated as scatter with density effect)
    {
        const config = {
            type: 'scatter',
            data: {
                datasets: [{
                    label: 'C92 Displacement',
                    data: xmr92.map((x, i) => ({ x, y: ymr92[i] })),
                    backgroundColor: 'rgba(31, 119, 180, 0.5)',
                    pointRadius: 3
                }]
            },
            options: {
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: 'Displacement in x (µrad)' },
                        min: x_av92.reduce((min: number, val: number) => Math.min(min, val), Infinity) - 5,
                        max: x_av92.reduce((max: number, val: number) => Math.max(max, val), -Infinity) + 5
                    },
                    y: {
                        type: 'linear',
                        title: { display: true, text: 'Displacement in y (µrad)' },
                        min: y_av92.reduce((min: number, val: number) => Math.min(min, val), Infinity) - 5,
                        max: y_av92.reduce((max: number, val: number) => Math.max(max, val), -Infinity) + 5
                    }
                },
                plugins: {
                    title: { display: true, text: 'Far-field centroid displacement (C92)' },
                    legend: { display: false }
                }
            }
        };

        await saveChart(config, 'FF_C92.png');
        console.log('Saved FF_C92.png');
    }

    // Creating day_table
    let day_table: [number, number][] = [];
    for (let i = 1; i <= Math.floor(run_days.length / d); i++) {
        day_table.push([i, d]);
    }
    if (run_days.length % d !== 0 && run_days.length > 2) {
        day_table.push([day_table.length + 1, run_days.length % d]);
    } else if (run_days.length % d !== 0 && run_days.length <= 2) {
        day_table = [[1, run_days.length % d]];
    }

    // Plotting displacement for C91
    for (const [groupNum, numSubplots] of day_table) {
        const canvasWidth = 800 * numSubplots;
        const subplotCanvas = new ChartJSNodeCanvas({ width: canvasWidth, height: 600 });

        const datasets: any[] = [];
        const annotations: any[] = [];
        let currentDayIdx = day_table.slice(0, day_table.findIndex(e => e[0] === groupNum)).reduce((sum, entry) => sum + entry[1], 0);

        for (let j = 0; j < numSubplots; j++) {
            const run_day = run_days[currentDayIdx + j];
            const tStart = moment({ year, month: mon - 1, date: run_day || 1, hour: openHour, minute: 0, second: 0 } as any);
            const tEnd = moment({ year, month: mon - 1, date: run_day || 1, hour: closedHour, minute: 0, second: 0 } as any);

            const day_indices = new_t.map((t, idx) => ({ t, idx })).filter(({ t }) => t.date() === run_day).map(({ idx }) => idx);
            const day_new_t = day_indices.map(i => new_t[i]);
            const day_x_av91 = day_indices.map(i => x_av91[i]);
            const day_y_av91 = day_indices.map(i => y_av91[i]);

            datasets.push({
                label: 'Horizontal',
                data: day_new_t.map((t, i) => ({ x: t?.valueOf() || 0, y: day_x_av91[i] || 0 })),
                pointRadius: 3,
                pointBackgroundColor: '#1f77b4',
                showLine: false,
                xAxisID: `x${j + 1}`,
                yAxisID: `y${j + 1}`
            });
            datasets.push({
                label: 'Vertical',
                data: day_new_t.map((t, i) => ({ x: t?.valueOf() || 0, y: day_y_av91[i] || 0 })),
                pointRadius: 3,
                pointBackgroundColor: '#ff7f0e',
                showLine: false,
                xAxisID: `x${j + 1}`,
                yAxisID: `y${j + 1}`
            });

            annotations.push({
                type: 'label',
                content: `Day ${run_day || 'Unknown'}`,
                xValue: tStart?.valueOf() || 0,
                yValue: (day_y_av91.length > 0 ? Math.max(...day_y_av91.filter(v => v !== undefined)) : 0) + 5,
                xAxisID: `x${j + 1}`,
                yAxisID: `y${j + 1}`,
                position: { x: 'center', y: 'top' }
            });
        }

        const config: ChartConfiguration<'scatter'> = {
            type: 'scatter',
            data: { datasets },
            options: {
                layout: { padding: { left: 50, right: 50, top: 50, bottom: 50 } },
                scales: {
                    ...Object.fromEntries(
                        Array.from({ length: numSubplots }, (_, j) => [
                            `x${j + 1}`,
                            {
                                type: 'linear',
                                position: 'bottom',
                                title: { display: true, text: 'Time (h)' },
                                min: moment({ year, month: mon - 1, date: run_days[currentDayIdx + j] || 1, hour: openHour, minute: 0, second: 0 } as any).valueOf(),
                                max: moment({ year, month: mon - 1, date: run_days[currentDayIdx + j] || 1, hour: closedHour, minute: 0, second: 0 } as any).valueOf(),
                                grid: { display: true },
                                offset: true,
                                ticks: {
                                    callback: function(value: any) {
                                        return moment(value).format('HH:mm');
                                    }
                                }
                            }
                        ])
                    ),
                    ...Object.fromEntries(
                        Array.from({ length: numSubplots }, (_, j) => [
                            `y${j + 1}`,
                            {
                                type: 'linear',
                                position: j === 0 ? 'left' : 'right',
                                title: { display: j === 0, text: 'Displacement (µm)' },
                                min: x_av91.reduce((min: number, val: number) => Math.min(min, val), Infinity) - 5,
                                max: y_av91.reduce((max: number, val: number) => Math.max(max, val), -Infinity) + 5,
                                grid: { display: true }
                            }
                        ])
                    )
                },
                plugins: {
                    title: { display: true, text: 'Near-field centroid displacement' },
                    legend: { display: true },
                    annotation: {
                        annotations: Object.fromEntries(
                            annotations.map((a, i) => [`ann${i}`, a])
                        )
                    }
                }
            }
        };

        await subplotCanvas.renderToBuffer(config).then(buffer => fs.writeFileSync(`Displacement_C91_${groupNum}.png`, buffer));
        console.log(`Saved Displacement_C91_${groupNum}.png`);
    }

    // Plotting displacement for C92
    for (const [groupNum, numSubplots] of day_table) {
        const canvasWidth = 800 * numSubplots;
        const subplotCanvas = new ChartJSNodeCanvas({ width: canvasWidth, height: 600 });

        const datasets: any[] = [];
        const annotations: any[] = [];
        let currentDayIdx = day_table.slice(0, day_table.findIndex(e => e[0] === groupNum)).reduce((sum, entry) => sum + entry[1], 0);

        for (let j = 0; j < numSubplots; j++) {
            const run_day = run_days[currentDayIdx + j];
            const tStart = moment({ year, month: mon - 1, date: run_day || 1, hour: openHour, minute: 0, second: 0 } as any);
            const tEnd = moment({ year, month: mon - 1, date: run_day || 1, hour: closedHour, minute: 0, second: 0 } as any);

            const day_indices = new_t.map((t, idx) => ({ t, idx })).filter(({ t }) => t.date() === run_day).map(({ idx }) => idx);
            const day_new_t = day_indices.map(i => new_t[i]);
            const day_x_av92 = day_indices.map(i => x_av92[i]);
            const day_y_av92 = day_indices.map(i => y_av92[i]);

            datasets.push({
                label: 'Horizontal',
                data: day_new_t.map((t, i) => ({ x: t?.valueOf() || 0, y: day_x_av92[i] || 0 })),
                pointRadius: 3,
                pointBackgroundColor: '#1f77b4',
                showLine: false,
                xAxisID: `x${j + 1}`,
                yAxisID: `y${j + 1}`
            });
            datasets.push({
                label: 'Vertical',
                data: day_new_t.map((t, i) => ({ x: t?.valueOf() || 0, y: day_y_av92[i] || 0 })),
                pointRadius: 3,
                pointBackgroundColor: '#ff7f0e',
                showLine: false,
                xAxisID: `x${j + 1}`,
                yAxisID: `y${j + 1}`
            });

            annotations.push({
                type: 'label',
                content: `Day ${run_day || 'Unknown'}`,
                xValue: tStart?.valueOf() || 0,
                yValue: (day_y_av92.length > 0 ? Math.max(...day_y_av92.filter(v => v !== undefined)) : 0) + 5,
                xAxisID: `x${j + 1}`,
                yAxisID: `y${j + 1}`,
                position: { x: 'center', y: 'top' }
            });
        }

        const config: ChartConfiguration<'scatter'> = {
            type: 'scatter',
            data: { datasets },
            options: {
                layout: { padding: { left: 50, right: 50, top: 50, bottom: 50 } },
                scales: {
                    ...Object.fromEntries(
                        Array.from({ length: numSubplots }, (_, j) => [
                            `x${j + 1}`,
                            {
                                type: 'linear',
                                position: 'bottom',
                                title: { display: true, text: 'Time (h)' },
                                min: moment({ year, month: mon - 1, date: run_days[currentDayIdx + j] || 1, hour: openHour, minute: 0, second: 0 } as any).valueOf(),
                                max: moment({ year, month: mon - 1, date: run_days[currentDayIdx + j] || 1, hour: closedHour, minute: 0, second: 0 } as any).valueOf(),
                                grid: { display: true },
                                offset: true,
                                ticks: {
                                    callback: function(value: any) {
                                        return moment(value).format('HH:mm');
                                    }
                                }
                            }
                        ])
                    ),
                    ...Object.fromEntries(
                        Array.from({ length: numSubplots }, (_, j) => [
                            `y${j + 1}`,
                            {
                                type: 'linear',
                                position: j === 0 ? 'left' : 'right',
                                title: { display: j === 0, text: 'Displacement (µrad)' },
                                min: x_av92.reduce((min: number, val: number) => Math.min(min, val), Infinity) - 5,
                                max: y_av92.reduce((max: number, val: number) => Math.max(max, val), -Infinity) + 5,
                                grid: { display: true }
                            }
                        ])
                    )
                },
                plugins: {
                    title: { display: true, text: 'Far-field centroid displacement' },
                    legend: { display: true },
                    annotation: { 
                        annotations: Object.fromEntries(
                            annotations.map((a, i) => [`ann${i}`, a])
                        )
                    }
                }
            }
        };

        await subplotCanvas.renderToBuffer(config).then(buffer => fs.writeFileSync(`Displacement_C92_${groupNum}.png`, buffer));
        console.log(`Saved Displacement_C92_${groupNum}.png`);
    }
}

// Function is now exported and can be called from other modules