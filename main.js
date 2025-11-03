const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { generateWavWithMarkers } = require('./wav-generator');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 650,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'default',
    title: 'CueSynch',
    movable: true,
    resizable: true
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Analyze CSV and return column information
ipcMain.handle('analyze-csv', async (event, csvPath, frameRate) => {
  try {
    // Read and parse CSV
    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    // Detect frame rate if set to 'auto'
    let detectedFrameRate = frameRate;
    if (frameRate === 'auto') {
      detectedFrameRate = detectFrameRate(csvContent);
    } else {
      detectedFrameRate = parseFloat(frameRate);
    }

    // Get column headers and sample data
    const { headers, rows } = parseCSVWithHeaders(csvContent);

    return {
      success: true,
      headers,
      rows: rows.slice(0, 5), // Return first 5 rows as preview
      frameRate: detectedFrameRate,
      csvPath
    };
  } catch (error) {
    return {
      success: false,
      message: `Error: ${error.message}`
    };
  }
});

// Generate WAV file with selected fields
ipcMain.handle('generate-wav', async (event, csvPath, frameRate, timeColumn, selectedFields) => {
  try {
    // Read and parse CSV
    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    const markers = parseCSVWithSelectedFields(csvContent, frameRate, timeColumn, selectedFields);

    // Ask user where to save the WAV file
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Marker Audio File',
      defaultPath: 'markers.wav',
      filters: [
        { name: 'WAV Files', extensions: ['wav'] }
      ]
    });

    if (!filePath) {
      return { success: false, message: 'Save cancelled' };
    }

    // Generate WAV file with markers
    await generateWavWithMarkers(markers, filePath);

    const frameRateInfo = frameRate ? ` (${frameRate} fps)` : '';

    return {
      success: true,
      message: `Markers file created successfully${frameRateInfo} at:\n${filePath}\n\nTo import into Logic Pro:\n1. Open your Logic Pro project\n2. Go to Navigate > Other > Import Marker from Audio File\n3. Select the generated WAV file`
    };
  } catch (error) {
    return {
      success: false,
      message: `Error: ${error.message}`
    };
  }
});

// Smart frame rate detection
function detectFrameRate(csvContent) {
  const lines = csvContent.trim().split('\n');
  const frameNumbers = [];

  // Skip header if present
  const startIndex = lines[0].toLowerCase().includes('time') || lines[0].toLowerCase().includes('name') ? 1 : 0;

  // Collect all frame numbers from timecodes with 4 parts (HH:MM:SS:FF)
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    if (values.length >= 1) {
      const timeParts = values[0].trim().split(':');
      if (timeParts.length === 4) {
        const frames = parseInt(timeParts[3]);
        if (!isNaN(frames)) {
          frameNumbers.push(frames);
        }
      }
    }
  }

  // No frame-based timecodes found, return default
  if (frameNumbers.length === 0) {
    return 30;
  }

  // Smart detection based on maximum frame number
  const maxFrame = Math.max(...frameNumbers);

  if (maxFrame < 24) {
    return 24; // Film standard
  } else if (maxFrame < 25) {
    return 25; // PAL standard
  } else if (maxFrame < 30) {
    return 30; // NTSC / Common standard
  } else if (maxFrame < 50) {
    return 50; // High frame rate
  } else {
    return 60; // Very high frame rate
  }
}

// Parse CSV and return headers and all data rows
function parseCSVWithHeaders(csvContent) {
  const lines = csvContent.trim().split('\n');
  if (lines.length === 0) {
    throw new Error('CSV file is empty');
  }

  // Parse header line
  const headers = parseCSVLine(lines[0]);

  // Parse all data rows
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    if (values.length > 0) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }
  }

  return { headers, rows };
}

// Parse CSV with selected fields for marker names
function parseCSVWithSelectedFields(csvContent, frameRate, timeColumn, selectedFields) {
  const { headers, rows } = parseCSVWithHeaders(csvContent);
  const markers = [];

  console.log('=== CSV PARSING DEBUG ===');
  console.log('Time Column:', timeColumn);
  console.log('Frame Rate:', frameRate);
  console.log('Total Rows:', rows.length);
  console.log('Note: Markers will be placed at their original times.');
  console.log('Logic Pro will automatically offset them based on project SMPTE settings.');

  for (const row of rows) {
    const timeStr = row[timeColumn];
    console.log('Row timecode:', timeStr);

    if (!timeStr) continue;

    const time = parseTime(timeStr, frameRate);
    console.log('Parsed time (seconds):', time);

    if (time === null) continue;

    // Build marker name from selected fields
    const nameParts = selectedFields
      .map(field => row[field])
      .filter(value => value && value.trim()); // Filter out empty values

    const name = nameParts.length > 0 ? nameParts.join(' - ') : 'Marker';

    markers.push({ time, name });
    console.log('Added marker:', name, 'at', time, 'seconds');
  }

  console.log('=== FINAL MARKERS ===');
  markers.forEach(m => console.log(m.name, '@', m.time, 'seconds'));

  // Sort markers by time
  markers.sort((a, b) => a.time - b.time);

  return markers;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function parseTime(timeStr, frameRate = 30) {
  timeStr = timeStr.trim();

  // Check if it contains colons (timecode format)
  if (!timeStr.includes(':')) {
    // Try to parse as seconds (e.g., "10.5" or "10")
    const seconds = parseFloat(timeStr);
    if (!isNaN(seconds)) {
      return seconds;
    }
    return null;
  }

  // Parse as MM:SS, HH:MM:SS, or HH:MM:SS:FF
  const timeParts = timeStr.split(':');
  if (timeParts.length === 2) {
    // MM:SS
    const minutes = parseInt(timeParts[0]);
    const secs = parseFloat(timeParts[1]);
    if (!isNaN(minutes) && !isNaN(secs)) {
      return minutes * 60 + secs;
    }
  } else if (timeParts.length === 3) {
    // HH:MM:SS
    const hours = parseInt(timeParts[0]);
    const minutes = parseInt(timeParts[1]);
    const secs = parseFloat(timeParts[2]);
    if (!isNaN(hours) && !isNaN(minutes) && !isNaN(secs)) {
      return hours * 3600 + minutes * 60 + secs;
    }
  } else if (timeParts.length === 4) {
    // HH:MM:SS:FF (with frames)
    const hours = parseInt(timeParts[0]);
    const minutes = parseInt(timeParts[1]);
    const secs = parseInt(timeParts[2]);
    const frames = parseInt(timeParts[3]);
    if (!isNaN(hours) && !isNaN(minutes) && !isNaN(secs) && !isNaN(frames)) {
      // Convert frames to seconds based on frame rate
      const frameSeconds = frames / frameRate;
      return hours * 3600 + minutes * 60 + secs + frameSeconds;
    }
  }

  return null;
}
