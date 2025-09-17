import * as fs from 'fs';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { Chart, registerables } from 'chart.js';
import type { ChartConfiguration } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import moment from 'moment';

// Import chartjs-adapter-moment for ES modules
import 'chartjs-adapter-moment';

Chart.register(...registerables, annotationPlugin);

// set locale once
moment.locale('en');


// Interface for rundata (adjust based on actual JSON structure)
interface RunData {
    Time: string[];
    L1ALFASHU0161OutValue: number[];
    L1OPA352PM98VALCALValue: number[];
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
            const prevVal = arr[i - window] || 0;
            sum -= prevVal;
            sumSq -= prevVal * prevVal;
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

// Exportable function that takes run_days as a parameter
async function generateCharts(run_days: number[], filePrefix: string = ''): Promise<void> {
    // Configure the adapter explicitly for ES modules
    Chart.defaults.scales.time = {
        ...Chart.defaults.scales.time,
        adapters: {
            date: {
                locale: 'en'
            }
        }
    };
    
    // Load rundata from JSON
    const rundataFile = filePrefix ? `./data/${filePrefix}rundata.json` : './data/rundata.json';
    const rundataRaw = fs.readFileSync(rundataFile, 'utf8');
    const rundata: Record<string, any[]> = JSON.parse(rundataRaw);
    const rundataTime_length = rundata.Time?.length || 0;

    // Chart prefix for output files
    const chartPrefix = filePrefix ? filePrefix.replace('_', '') : '';

    const pixel = 0.4e-6; // m (1pixel = 4um with 10x mag)
    const lens = 0.5; // m
    const aim = 10; // microrad

    const t_start = moment(rundata.Time?.[0]);
    const t_end = moment(rundata.Time?.[rundataTime_length - 1]);
    const year = t_start.year();
    const mon = t_start.month() + 1; // Moment months are 0-indexed
    const openHour = 7; // hour that the measurement starts from
    const closedHour = 21; // hour that the measurement shuts down
    
    // Create a general date string for chart titles (will be updated per day in loops)
    let generalDateString = t_start.format('YYYY-MM-DD');

    const high_power = 40; // power level for "high power"
    const added_time = 0; // time difference between GMT and local time
 

    // Creating datasets for specific conditions (power, shutter etc)
    let index_new: number[] = [];
    const shutter_val = rundata.L1ALFASHU0161OutValue || [];
    
    // Convert shutter values to numbers, treating empty strings as 0 (closed)
    const shutter_numeric = shutter_val.map(v => {
        if (v === '' || v === null || v === undefined) return 0;
        return Number(v) || 0;
    });

    // For power graphs, we want to include ALL data for the day, not just when shutter is open
    // The shutter status will be shown as separate lines on the graph
    for (const run_day of run_days) {
        for (let i = 0; i < rundataTime_length; i++) {
            const t = moment(rundata.Time?.[i]);
            if (shutter_numeric[i] === 1 && t.date() === run_day) {  // Only include when shutter is open
                index_new.push(i);
            }
        }
    }

    // Debugging code
    console.log('=== RUNDATA ANALYSIS ===');
    Object.keys(rundata).forEach(key => {
        const data = rundata[key];
        console.log(`${key}:`);
        console.log(`  - Length: ${data?.length || 0}`);
        console.log(`  - Type: ${typeof data}`);
        console.log(`  - First value: ${data?.[0]}`);
        console.log(`  - Last value: ${data?.[(data?.length || 1) - 1]}`);
        console.log('---');
    });
    console.log('========================');

    // Loop creating power graphs indices - include all data for power calculation
    let pwr_index: number[] = [];

    for (const run_day of run_days) {
        for (let i = 0; i < rundataTime_length; i++) {
            const t = moment(rundata.Time?.[i]);
            if (t.date() === run_day) {
                pwr_index.push(i);
            }
        }
    }

    // Power calculations
    const power: number[] = pwr_index.map(i => (rundata.L1OPA352PM98VALCALValue?.[i]) * 41 / 34);
    const pwr_time: moment.Moment[] = pwr_index.map(i => addHours(moment(rundata.Time?.[i]), added_time));
    const low_power: number[] = pwr_index.map(i => rundata.L1OPA4PM21VALCALValue?.[i]);

    // Shutter logic: assuming 1 = open, 0 = closed
    // Alternative: if shutter is inverted (0 = open, 1 = closed), uncomment the next line
    // const shutter_val_inverted = shutter_val.map(v => 1 - (v || 0));
    
    // Shutter processing - use numeric shutter values
    const shutter_good: number[] = pwr_index.map(i => high_power * (shutter_numeric[i] || 0));
    const shutter_low: number[] = shutter_good.map(v => v * (5 / high_power));
    const shutter_med: number[] = shutter_good.map(v => v * (20 / high_power));

// Moving averages
const av_power = movmean(power, 100);
const av_low_power = movmean(low_power, 100);


//debugging code
console.log('===    Graph Data ===');
console.log(`Total data points: ${rundataTime_length}`);
console.log(`Power index length: ${pwr_index.length}`);
console.log(`Index new length: ${index_new.length}`);
console.log(`Shutter data sample:`, shutter_numeric.slice(0, 10));
console.log(`Power data sample:`, power.slice(0, 10));

for (let i = 5; i < 22; i++) {
    console.log("Time: ", rundata.Time?.[i]);
    console.log("pwr_time: ", pwr_time[i]);
    console.log("av_power: ", av_power[i]);
    console.log("av_low_power: ", av_low_power[i]);
    console.log("shutter_good: ", shutter_good[i]);
    console.log("shutter_low: ",shutter_low[i]);
    console.log("shutter_med: ",shutter_med[i]);
    console.log("===***********************===");
}
console.log("=========================");

// High power plots, one per day - MATLAB equivalent approach
for (const run_day of run_days) {
    const day_indices = pwr_index.filter(i => moment(rundata.Time?.[i]).date() === run_day);
        const day_pwr_time = day_indices.map(i => pwr_time[pwr_index.indexOf(i)]);
        const day_av_power = day_indices.map(i => av_power[pwr_index.indexOf(i)]);
        const day_shutter_good = day_indices.map(i => shutter_good[i]);
        const day_shutter_low = day_indices.map(i => shutter_low[i]);
    // Set time limits for this specific day (like MATLAB's xlim)
    const tStart = moment({ year, month: mon - 1, date: run_day || 1, hour: openHour, minute: 0, second: 0 });
    const tEnd = moment({ year, month: mon - 1, date: run_day || 1, hour: closedHour, minute: 0, second: 0 });
    
    // Update date string for this day
    generalDateString = tStart.format('YYYY-MM-DD');

    const config = {
        type: 'line',
        data: {
            datasets: [
                {
                    label: 'Average Power',
                    data: day_pwr_time.map((t, i) => ({ x: t!.valueOf(), y: day_av_power[i] })),
                    pointRadius: 3,
                    borderColor: 'blue',
                    showLine: false
                },
                {
                    label: 'Shutter Good',
                    data: day_pwr_time.map((t, i) => ({ x: t!.valueOf(), y: day_shutter_good[i] })),
                    borderColor: '#ff7f0e',
                    borderWidth: 2,
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: 'Shutter Low',
                    data: day_pwr_time.map((t, i) => ({ x: t!.valueOf(), y: day_shutter_low[i] })),
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
                    min: tStart.valueOf(),  // This clips the view to the current day
                    max: tEnd.valueOf(),    // like MATLAB's xlim([tStart tEnd])
                    ticks: {
                        stepSize: 2 * 60 * 60 * 1000, // 2 hours in milliseconds
                        callback: function(value: any) {
                            const hour = moment(value).hour();
                            // Only show odd hours from 7 to 21 (7, 9, 11, 13, 15, 17, 19, 21)
                            if (hour >= 7 && hour <= 21 && hour % 2 === 1) {
                                return hour + ':00';
                            }
                            return '';
                        }
                    }
                },
                y: {
                    type: 'linear',
                    title: { display: true, text: 'Energy (mJ)' },
                    min: 0,
                    max: 10  // like MATLAB's ylim([0 10])
                }
            },
            plugins: {
                title: { 
                    display: true, 
                    text: `Low power (~5mJ) requested - ${generalDateString}`,
                    font: { size: 16 }
                },
                legend: { display: true }
            }
        }
    };

    await saveChart(config, `./visualization/${chartPrefix}power_day_.png`);
    console.log(`Saved power graph for day ${run_day}`);
}

    // Creating data sets for time, centroid and power
    const x91 = index_new.map(i => rundata.L1CMPC91CentroidXValue?.[i] || 0);
    const y91 = index_new.map(i => rundata.L1CMPC91CentroidYValue?.[i] || 0);
    const x92 = index_new.map(i => rundata.L1CMPC92CentroidXValue?.[i] || 0);
    const y92 = index_new.map(i => rundata.L1CMPC92CentroidYValue?.[i] || 0);
    const new_t = index_new.map(i => addHours(moment(rundata.Time?.[i]), added_time));
    
    // Create time arrays for displacement graphs using the same logic as power graphs
    const displacement_time = index_new.map(i => addHours(moment(rundata.Time?.[i]), added_time));

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

   // Function to create 2D histogram bins (equivalent to MATLAB's histogram2)
function create2DHistogram(xData: number[], yData: number[], xBins = 20, yBins = 20) {
    const xMin = Math.min(...xData);
    const xMax = Math.max(...xData);
    const yMin = Math.min(...yData);
    const yMax = Math.max(...yData);
    
    const xStep = (xMax - xMin) / xBins;
    const yStep = (yMax - yMin) / yBins;
    
    // Create 2D array for histogram counts
    const histogram = Array(yBins).fill(null).map(() => Array(xBins).fill(0));
    
    // Fill histogram
    for (let i = 0; i < xData.length; i++) {
        const xBin = Math.min(Math.floor(((xData[i] || 0) - xMin) / xStep), xBins - 1);
        const yBin = Math.min(Math.floor(((yData[i] || 0) - yMin) / yStep), yBins - 1);
        histogram[yBin]![xBin]++;
    }
    
    // Convert to Chart.js format
    const chartData = [];
    const maxCount = Math.max(...histogram.flat());
    
    for (let yBin = 0; yBin < yBins; yBin++) {
        for (let xBin = 0; xBin < xBins; xBin++) {
            if (histogram[yBin]![xBin] > 0) {
                const x = xMin + (xBin + 0.5) * xStep;
                const y = yMin + (yBin + 0.5) * yStep;
                const count = histogram[yBin]![xBin];
                const intensity = count / maxCount;
                
                chartData.push({
                    x: x,
                    y: y,
                    count: count,
                    intensity: intensity
                });
            }
        }
    }
    
    return chartData;
}

// Function to get color based on intensity (similar to MATLAB colormap)
function getColorFromIntensity(intensity: number) {
    // Using a blue-to-red colormap similar to MATLAB's default
    const r = Math.floor(255 * intensity);
    const g = Math.floor(255 * (1 - Math.abs(intensity - 0.5) * 2));
    const b = Math.floor(255 * (1 - intensity));
    return `rgba(${r}, ${g}, ${b}, 0.8)`;
}

// Improved histogram plot 91 (2D histogram equivalent)
{
    const histogramData = create2DHistogram(xmr91, ymr91, 20, 20);
    
    const config = {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'C91 Displacement Density',
                data: histogramData,
                backgroundColor: function(context: any) {
                    const point = context.parsed;
                    const dataPoint = histogramData.find(d => d.x === point.x && d.y === point.y);
                    return dataPoint ? getColorFromIntensity(dataPoint.intensity) : 'rgba(0,0,0,0)';
                },
                pointRadius: function(context: any) {
                    const point = context.parsed;
                    const dataPoint = histogramData.find(d => d.x === point.x && d.y === point.y);
                    return dataPoint ? Math.max(3, Math.sqrt(dataPoint.count) * 2) : 3;
                }
            }]
        },
        options: {
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Displacement in x (µm)', font: { size: 12 } },
                    min: Math.min(...x_av91) - 5,
                    max: Math.max(...x_av91) + 5
                },
                y: {
                    type: 'linear',
                    title: { display: true, text: 'Displacement in y (µm)', font: { size: 12 } },
                    min: Math.min(...y_av91) - 5,
                    max: Math.max(...y_av91) + 5
                }
            },
            plugins: {
                title: { 
                    display: true, 
                    text: `Near-field centroid displacement (C91) - ${generalDateString}`,
                    font: { size: 12 }
                },
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterBody: function(context: any) {
                            const dataPoint = histogramData[context[0].dataIndex];
                            return `Count: ${dataPoint?.count || 0}`;
                        }
                    }
                }
            }
        }
    };

    await saveChart(config, `./visualization/${chartPrefix}NF_C91.png`);
    console.log(`Saved ${chartPrefix}NF_C91.png`);
}

// Improved histogram plot 92 (2D histogram equivalent)
{
    const histogramData = create2DHistogram(xmr92, ymr92, 20, 20);
    
    const config = {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'C92 Displacement Density',
                data: histogramData,
                backgroundColor: function(context: any) {
                    const point = context.parsed;
                    const dataPoint = histogramData.find(d => d.x === point.x && d.y === point.y);
                    return dataPoint ? getColorFromIntensity(dataPoint.intensity) : 'rgba(0,0,0,0)';
                },
                pointRadius: function(context: any) {
                    const point = context.parsed;
                    const dataPoint = histogramData.find(d => d.x === point.x && d.y === point.y);
                    return dataPoint ? Math.max(3, Math.sqrt(dataPoint.count) * 2) : 3;
                }
            }]
        },
        options: {
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Displacement in x (µrad)', font: { size: 12 } },
                    min: Math.min(...x_av92) - 5,
                    max: Math.max(...x_av92) + 5
                },
                y: {
                    type: 'linear',
                    title: { display: true, text: 'Displacement in y (µrad)', font: { size: 12 } },
                    min: Math.min(...y_av92) - 5,
                    max: Math.max(...y_av92) + 5
                }
            },
            plugins: {
                title: { 
                    display: true, 
                    text: `Far-field centroid displacement (C92) - ${generalDateString}`,
                    font: { size: 12 }
                },
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterBody: function(context: any) {
                            const dataPoint = histogramData[context[0].dataIndex];
                            return `Count: ${dataPoint?.count || 0}`;
                        }
                    }
                }
            }
        }
    };

    await saveChart(config, `./visualization/${chartPrefix}FF_C92.png`);
    console.log(`Saved ${chartPrefix}FF_C92.png`);
}

    // Creating day_table
    const d = run_days.length; // number of desired subplots
    function createDayTable(run_days: number[], d: number): [number, number][] {
        let day_table: [number, number][] = [];
        
        // Main loop - equivalent to MATLAB for loop
        for (let i = 1; i <= Math.floor(run_days.length / d); i++) {
            day_table.push([i, d]);
        }
        
        // Handle remainder cases
        if (run_days.length % d !== 0 && run_days.length > 2) {
            // Use the last i value from the loop, then increment
            const lastI = Math.floor(run_days.length / d);
            day_table.push([lastI + 1, run_days.length % d]);
        } else if (run_days.length % d !== 0 && run_days.length <= 2) {
            day_table = [[1, run_days.length % d]];
        }
        
        return day_table;
    }

    let day_table: [number, number][] = createDayTable(run_days, d);

    async function plotDisplacementC91(day_table: [number, number][], run_days: number[], displacement_time: moment.Moment[], x_av91: number[], y_av91: number[], year: number, mon: number, openHour: number, closedHour: number) {
        let k = 1; // Global subplot counter like MATLAB
        
        for (let i = 1; i <= (day_table[day_table.length - 1]?.[0] || 0); i++) { // Equivalent to 1:day_table(end,1)
            const currentRow = day_table[i - 1]; // day_table(i,:) - adjust for 0-indexing
            const numSubplots = currentRow?.[1] || 0; // day_table(i,2)
            
            // Create new figure
            const canvasWidth = 800 * numSubplots;
            const subplotCanvas = new ChartJSNodeCanvas({ width: canvasWidth, height: 600 });
            const datasets: any[] = [];
            const annotations: any[] = [];
            
            if (i === 1) {
                // First group: j = 1 to day_table(1,2)
                for (let j = 1; j <= numSubplots; j++) {
                    const run_day = run_days[j - 1]; // MATLAB: run_days(j)
                    
                    // MATLAB approach: Plot ALL data, then limit x-axis
                    const tStart = moment({ year, month: mon - 1, date: run_day || 1, hour: openHour, minute: 0, second: 0 });
                    const tEnd = moment({ year, month: mon - 1, date: run_day || 1, hour: closedHour, minute: 0, second: 0 });
                    
                    // Filter data for the current day like power graphs
                    const day_indices = index_new.filter(i => moment(rundata.Time?.[i]).date() === run_day);
                    const day_displacement_time = day_indices.map(i => displacement_time[index_new.indexOf(i)]);
                    const day_x_av91 = day_indices.map(i => x_av91[index_new.indexOf(i)]);
                    const day_y_av91 = day_indices.map(i => y_av91[index_new.indexOf(i)]);
                    
                    // Plot filtered data points
                    datasets.push({
                        label: j === 1 ? 'Horizontal' : '', // Only show legend once
                        data: day_displacement_time.map((t, i) => ({ x: t!.valueOf(), y: day_x_av91[i] })),
                        pointRadius: 3,
                        pointBackgroundColor: '#1f77b4',
                        showLine: false,
                        xAxisID: `x${j}`,
                        yAxisID: `y${j}`,
                        legendGroup: 'horizontal'
                    });
                    
                    datasets.push({
                        label: j === 1 ? 'Vertical' : '', // Only show legend once
                        data: day_displacement_time.map((t, i) => ({ x: t!.valueOf(), y: day_y_av91[i] })),
                        pointRadius: 3,
                        pointBackgroundColor: '#ff7f0e',
                        showLine: false,
                        xAxisID: `x${j}`,
                        yAxisID: `y${j}`,
                        legendGroup: 'vertical'
                    });
                    
                    // Add day label annotation
                    annotations.push({
                        type: 'label',
                        content: `Day ${run_day}`,
                        xValue: tStart.valueOf(),
                        yValue: Math.max(...y_av91.filter((v: number) => !isNaN(v))) + 5,
                        xAxisID: `x${j}`,
                        yAxisID: `y${j}`
                    });
                }
            } else {
                // Subsequent groups: More complex day index calculation like MATLAB
                let startIdx, endIdx;
                
                if (numSubplots % d === 0) { // mod(day_table(i,2),d) == 0
                    // j = (day_table(i-1,1)*day_table(i-1,2))+1 : (day_table(i,1)*day_table(i,2))
                    const prevRow = day_table[i - 2]; // day_table(i-1,:)
                    startIdx = ((prevRow?.[0] || 0) * (prevRow?.[1] || 0)) + 1;
                    endIdx = (currentRow?.[0] || 0) * (currentRow?.[1] || 0);
                } else {
                    // j = (day_table(i-1,1)*day_table(i-1,2)+1) : (day_table(i-1,1)*day_table(i-1,2)+day_table(i,2))
                    const prevRow = day_table[i - 2]; // day_table(i-1,:)
                    startIdx = ((prevRow?.[0] || 0) * (prevRow?.[1] || 0)) + 1;
                    endIdx = ((prevRow?.[0] || 0) * (prevRow?.[1] || 0)) + (currentRow?.[1] || 0);
                }
                
                let subplotIndex = 1;
                for (let j = startIdx; j <= endIdx; j++) {
                    const run_day = run_days[j - 1]; // Adjust for 0-indexing
                    
                    const tStart = moment({ year, month: mon - 1, date: run_day || 1, hour: openHour, minute: 0, second: 0 });
                    const tEnd = moment({ year, month: mon - 1, date: run_day || 1, hour: closedHour, minute: 0, second: 0 });
                    
                    // Filter data for the current day like power graphs
                    const day_indices = index_new.filter(i => moment(rundata.Time?.[i]).date() === run_day);
                    const day_displacement_time = day_indices.map(i => displacement_time[index_new.indexOf(i)]);
                    const day_x_av91 = day_indices.map(i => x_av91[index_new.indexOf(i)]);
                    const day_y_av91 = day_indices.map(i => y_av91[index_new.indexOf(i)]);
                    
                    // Plot filtered data points
                    datasets.push({
                        label: subplotIndex === 1 ? 'Horizontal' : '',
                        data: day_displacement_time.map((t, i) => ({ x: t!.valueOf(), y: day_x_av91[i] })),
                        pointRadius: 3,
                        pointBackgroundColor: '#1f77b4',
                        showLine: false,
                        xAxisID: `x${subplotIndex}`,
                        yAxisID: `y${subplotIndex}`
                    });
                    
                    datasets.push({
                        label: subplotIndex === 1 ? 'Vertical' : '',
                        data: day_displacement_time.map((t, i) => ({ x: t!.valueOf(), y: day_y_av91[i] })),
                        pointRadius: 3,
                        pointBackgroundColor: '#ff7f0e',
                        showLine: false,
                        xAxisID: `x${subplotIndex}`,
                        yAxisID: `y${subplotIndex}`
                    });
                    
                    annotations.push({
                        type: 'label',
                        content: `Day ${run_day}`,
                        xValue: tStart.valueOf(),
                        yValue: Math.max(...y_av91.filter((v: number) => !isNaN(v))) + 5,
                        xAxisID: `x${subplotIndex}`,
                        yAxisID: `y${subplotIndex}`
                    });
                    
                    subplotIndex++;
                }
                
                k = 1; // Reset k like MATLAB does
            }
            
            // Create chart configuration
            const config: ChartConfiguration<'scatter'> = {
                type: 'scatter' as const,
                data: { datasets },
                options: {
                    layout: { padding: { left: 50, right: 50, top: 50, bottom: 50 } },
                    scales: {
                        // Create x-axes for each subplot with proper time limits
                        ...Object.fromEntries(
                            Array.from({ length: numSubplots }, (_, j) => [
                                `x${j + 1}`,
                                {
                                    type: 'linear' as const,
                                    position: 'bottom',
                                    title: { display: j === 0, text: 'Time (h)', font: { size: 16 } },
                                    min: moment({ year, month: mon - 1, date: run_days[j] || 1, hour: openHour }).valueOf(),
                                    max: moment({ year, month: mon - 1, date: run_days[j] || 1, hour: closedHour }).valueOf(),
                                    grid: { display: true },
                                    ticks: {
                                        stepSize: 2 * 60 * 60 * 1000, // 2 hours in milliseconds
                                        callback: function(value: any) {
                                            const hour = moment(value).hour();
                                            // Only show odd hours from 7 to 21 (7, 9, 11, 13, 15, 17, 19, 21)
                                            if (hour >= 7 && hour <= 21 && hour % 2 === 1) {
                                                return hour + ':00';
                                            }
                                            return '';
                                        }
                                    }
                                }
                            ])
                        ),
                        // Create y-axes for each subplot
                        ...Object.fromEntries(
                            Array.from({ length: numSubplots }, (_, j) => [
                                `y${j + 1}`,
                                {
                                    type: 'linear' as const,
                                    position: j === 0 ? 'left' : 'right',
                                    title: { display: j === 0, text: 'Displacement (µm)', font: { size: 16 } },
                                    min: Math.min(...x_av91) - 5,
                                    max: Math.max(...y_av91) + 5,
                                    grid: { display: true }
                                }
                            ])
                        )
                    },
                    plugins: {
                        title: { 
                            display: true, 
                            text: `Near-field centroid displacement - ${generalDateString}`,
                            font: { size: 16 }
                        },
                        legend: { display: true },
                        annotation: {
                            annotations: Object.fromEntries(
                                annotations.map((a: any, idx: number) => [`ann${idx}`, a])
                            )
                        }
                    }
                }
            };
            
            // Save figure
            await subplotCanvas.renderToBuffer(config).then(buffer => 
                fs.writeFileSync(`./visualization/${chartPrefix}Displacement_C91_${i}.png`, buffer)
            );
            console.log(`Saved ${chartPrefix}Displacement_C91_${i}.png`);
        }
    }

    // await plotDisplacementC91(day_table, run_days, displacement_time, x_av91, y_av91, year, mon, openHour, closedHour);

    async function plotDisplacementC92(day_table: [number, number][], run_days: number[], displacement_time: moment.Moment[], x_av92: number[], y_av92: number[], year: number, mon: number, openHour: number, closedHour: number, d: number) {
        let k = 1; // Global subplot counter like MATLAB
        
        for (let i = 1; i <= (day_table[day_table.length - 1]?.[0] || 0); i++) {
            const currentRow = day_table[i - 1]; // day_table(i,:)
            const numSubplots = currentRow?.[1] || 0; // day_table(i,2)
            
            const canvasWidth = 800 * numSubplots;
            const subplotCanvas = new ChartJSNodeCanvas({ width: canvasWidth, height: 600 });
            const datasets: any[] = [];
            const annotations: any[] = [];
            
            if (i === 1) {
                // First group: j = 1 to day_table(1,2)
                console.log(`=== C92 FIGURE ${i} ===`);
                
                for (let j = 1; j <= numSubplots; j++) {
                    const run_day = run_days[j - 1]; // MATLAB: run_days(j)
                    
                    console.log(`Processing subplot ${j} for day ${run_day}`);
                    
                    const tStart = moment({ year, month: mon - 1, date: run_day || 1, hour: openHour, minute: 0, second: 0 });
                    const tEnd = moment({ year, month: mon - 1, date: run_day || 1, hour: closedHour, minute: 0, second: 0 });
                    
                    // Filter data for the current day like power graphs
                    const day_indices = index_new.filter(i => moment(rundata.Time?.[i]).date() === run_day);
                    const day_displacement_time = day_indices.map(i => displacement_time[index_new.indexOf(i)]);
                    const day_x_av92 = day_indices.map(i => x_av92[index_new.indexOf(i)]);
                    const day_y_av92 = day_indices.map(i => y_av92[index_new.indexOf(i)]);
                    
                    // Plot filtered data points
                    datasets.push({
                        label: j === 1 ? 'Horizontal' : '', // Legend only on first subplot
                        data: day_displacement_time.map((t, i) => ({ x: t!.valueOf(), y: day_x_av92[i] })),
                        pointRadius: 3,
                        pointBackgroundColor: '#1f77b4',
                        showLine: false,
                        xAxisID: `x${j}`,
                        yAxisID: `y${j}`,
                        hidden: false
                    });
                    
                    datasets.push({
                        label: j === 1 ? 'Vertical' : '',
                        data: day_displacement_time.map((t, i) => ({ x: t!.valueOf(), y: day_y_av92[i] })),
                        pointRadius: 3,
                        pointBackgroundColor: '#ff7f0e',
                        showLine: false,
                        xAxisID: `x${j}`,
                        yAxisID: `y${j}`,
                        hidden: false
                    });
                }
                
                // Save with filename pattern: 'Displacement C92' + num2str(i)
                const filename = `./visualization/${chartPrefix}Displacement_C92_${i}.png`;
                await subplotCanvas.renderToBuffer(createChartConfig(datasets, annotations, numSubplots, run_days, year, mon, openHour, closedHour, x_av92, y_av92, 'Far-field centroid displacement', 'µrad') as any).then(buffer => 
                    fs.writeFileSync(filename, buffer)
                );
                console.log(`Saved ${filename}`);
                
            } else {
                // Subsequent groups with complex day index calculation
                let startIdx, endIdx, filename;
                
                if (numSubplots % d === 0) { // mod(day_table(i,2),d) == 0
                    console.log(`=== C92 FIGURE ${i} (mod == 0 branch) ===`);
                    
                    const prevRow = day_table[i - 2]; // day_table(i-1,:)
                    startIdx = ((prevRow?.[0] || 0) * (prevRow?.[1] || 0)) + 1;
                    endIdx = (currentRow?.[0] || 0) * (currentRow?.[1] || 0);
                    filename = `./visualization/${chartPrefix}Displacement_C92_${endIdx}.png`; // Uses 'j' (which equals endIdx)
                    
                } else {
                    console.log(`=== C92 FIGURE ${i} (mod != 0 branch) ===`);
                    
                    const prevRow = day_table[i - 2]; // day_table(i-1,:)
                    startIdx = ((prevRow?.[0] || 0) * (prevRow?.[1] || 0)) + 1;
                    endIdx = ((prevRow?.[0] || 0) * (prevRow?.[1] || 0)) + (currentRow?.[1] || 0);
                    filename = `./visualization/${chartPrefix}Displacement_C92_${endIdx}.png`; // Uses 'j' (which equals endIdx)
                }
                
                console.log(`Day range: ${startIdx} to ${endIdx}`);
                
                let subplotIndex = 1;
                for (let j = startIdx; j <= endIdx; j++) {
                    const run_day = run_days[j - 1]; // Adjust for 0-indexing
                    
                    console.log(`Processing subplot ${subplotIndex} (k=${k}) for day ${run_day}`);
                    
                    const tStart = moment({ year, month: mon - 1, date: run_day || 1, hour: openHour, minute: 0, second: 0 });
                    const tEnd = moment({ year, month: mon - 1, date: run_day || 1, hour: closedHour, minute: 0, second: 0 });
                    
                    // Filter data for the current day like power graphs
                    const day_indices = index_new.filter(i => moment(rundata.Time?.[i]).date() === run_day);
                    const day_displacement_time = day_indices.map(i => displacement_time[index_new.indexOf(i)]);
                    const day_x_av92 = day_indices.map(i => x_av92[index_new.indexOf(i)]);
                    const day_y_av92 = day_indices.map(i => y_av92[index_new.indexOf(i)]);
                    
                    // Plot filtered data points
                    datasets.push({
                        label: subplotIndex === 1 ? 'Horizontal' : '',
                        data: day_displacement_time.map((t, i) => ({ x: t!.valueOf(), y: day_x_av92[i] })),
                        pointRadius: 3,
                        pointBackgroundColor: '#1f77b4',
                        showLine: false,
                        xAxisID: `x${subplotIndex}`,
                        yAxisID: `y${subplotIndex}`
                    });
                    
                    datasets.push({
                        label: subplotIndex === 1 ? 'Vertical' : '',
                        data: day_displacement_time.map((t, i) => ({ x: t!.valueOf(), y: day_y_av92[i] })),
                        pointRadius: 3,
                        pointBackgroundColor: '#ff7f0e',
                        showLine: false,
                        xAxisID: `x${subplotIndex}`,
                        yAxisID: `y${subplotIndex}`
                    });
                    
                    subplotIndex++;
                    k++; // Increment k like MATLAB
                }
                
                await subplotCanvas.renderToBuffer(createChartConfig(datasets, annotations, numSubplots, run_days, year, mon, openHour, closedHour, x_av92, y_av92, 'Far-field centroid displacement', 'µrad') as any).then(buffer => 
                    fs.writeFileSync(filename, buffer)
                );
                console.log(`Saved ${filename}`);
                
                k = 1; // Reset k like MATLAB
            }
        }
    }
    
    function createChartConfig(datasets: any[], annotations: any[], numSubplots: number, run_days: number[], year: number, mon: number, openHour: number, closedHour: number, x_av_data: number[], y_av_data: number[], title: string, unit: string) {
        return {
            type: 'scatter' as const,
            data: { datasets },
            options: {
                layout: { padding: { left: 50, right: 50, top: 50, bottom: 50 } },
                scales: {
                    // X-axes with time limits for each subplot
                    ...Object.fromEntries(
                        Array.from({ length: numSubplots }, (_, j) => [
                            `x${j + 1}`,
                            {
                                type: 'linear',
                                position: 'bottom',
                                title: { display: j === Math.floor(numSubplots/2), text: 'Time (h)', font: { size: 16 } },
                                min: moment({ year, month: mon - 1, date: run_days[j] || 1, hour: openHour }).valueOf(),
                                max: moment({ year, month: mon - 1, date: run_days[j] || 1, hour: closedHour }).valueOf(),
                                grid: { display: true },
                                ticks: {
                                    stepSize: 2 * 60 * 60 * 1000, // 2 hours in milliseconds
                                    callback: function(value: any) {
                                        const hour = moment(value).hour();
                                        // Only show odd hours from 7 to 21 (7, 9, 11, 13, 15, 17, 19, 21)
                                        if (hour >= 7 && hour <= 21 && hour % 2 === 1) {
                                            return hour + ':00';
                                        }
                                        return '';
                                    }
                                }
                            }
                        ])
                    ),
                    // Y-axes with MATLAB-style mixed limits
                    ...Object.fromEntries(
                        Array.from({ length: numSubplots }, (_, j) => [
                            `y${j + 1}`,
                            {
                                type: 'linear',
                                position: j === 0 ? 'left' : 'right',
                                title: { display: j === 0, text: `Displacement (${unit})`, font: { size: 16 } },
                                // MATLAB: ylim([min(x_av92)-5 max(y_av92)+5])
                                min: Math.min(...x_av_data) - 5,
                                max: Math.max(...y_av_data) + 5,
                                grid: { display: true }
                            }
                        ])
                    )
                },
                plugins: {
                    title: { 
                        display: true, 
                        text: title,
                        font: { size: 16 }
                    },
                    legend: { display: true },
                    annotation: {
                        annotations: Object.fromEntries(
                            annotations.map((a: any, idx: number) => [`ann${idx}`, a])
                        )
                    }
                }
            }
        };
    }

    // await plotDisplacementC92(day_table, run_days, displacement_time, x_av92, y_av92, year, mon, openHour, closedHour, d);
}

export default { generateCharts };