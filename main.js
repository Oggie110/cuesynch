const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { generateWavWithMarkers } = require('./wav-generator');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 800,
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
ipcMain.handle('generate-wav', async (event, csvPath, frameRate, timeColumn, selectedFields, fileNameField, firstRowValue) => {
  try {
    // Read and parse CSV
    const csvContent = fs.readFileSync(csvPath, 'utf-8');

    const { markers, startTimecode } = parseCSVWithSelectedFields(csvContent, frameRate, timeColumn, selectedFields);

    // Determine default filename and directory
    const csvDir = path.dirname(csvPath);
    let defaultFileName = 'Marker-list.wav';

    if (fileNameField && firstRowValue) {
      // Remove any existing file extensions FIRST
      let processed = firstRowValue.replace(/\.(mp4|mov|wav|aiff|m4a|mp3|aif)$/i, '');

      // Then sanitize the filename (remove invalid characters)
      let sanitized = processed.replace(/[^a-z0-9_\-\s]/gi, '_').trim();

      if (sanitized) {
        defaultFileName = `${sanitized}_marker_list.wav`;
      }
    }

    const defaultPath = path.join(csvDir, defaultFileName);

    // Ask user where to save the WAV file
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Marker Audio File',
      defaultPath: defaultPath,
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

    // Try to import into Logic Pro using keyboard shortcut
    try {
      const { exec } = require('child_process');

      // Get just the directory path and filename separately
      // Normalize to NFC (composed form) to handle Swedish characters (Å, Ä, Ö) properly
      const dirPath = path.dirname(filePath).normalize('NFC');
      const fileName = path.basename(filePath).normalize('NFC');

      console.log('=== IMPORT AUTOMATION DEBUG ===');
      console.log('Full filePath:', filePath);
      console.log('Directory path:', dirPath);
      console.log('Filename:', fileName);

      // Create AppleScript content
      const appleScript = `
        tell application "System Events"
          if not (exists process "Logic Pro") then
            return "Logic Pro not running"
          end if
        end tell

        tell application "Logic Pro"
          activate
        end tell

        delay 1

        tell application "System Events"
          tell process "Logic Pro"
            -- Open "Go to Position" dialog and set playhead to start timecode
            keystroke "/"
            delay 0.5
            keystroke "${startTimecode}"
            delay 0.3
            keystroke return

            delay 0.5

            -- Create new audio track
            keystroke "a" using {option down, command down}

            delay 1

            -- Press Shift+Command+I to open import dialog
            keystroke "i" using {shift down, command down}

            delay 2

            -- Navigate to folder in open dialog
            keystroke "g" using {command down, shift down}
            delay 0.5
            keystroke "${dirPath}"
            delay 0.5
            keystroke return

            delay 1

            -- Type filename to select it
            keystroke "${fileName}"
            delay 0.5
            keystroke return

            delay 2

            -- After import completes, trigger "Import Marker from Audio File" on the imported region
            click menu item "Import Marker from Audio File" of menu 1 of menu item "Other" of menu "Navigate" of menu bar 1

            delay 1

            return "success"
          end tell
        end tell
      `;

      // Write AppleScript to temporary file
      const tempScript = path.join(os.tmpdir(), 'cuesynch-import.applescript');
      fs.writeFileSync(tempScript, appleScript);

      // Execute the temporary file
      exec(`osascript "${tempScript}"`, (error, stdout, stderr) => {
        // Clean up temp file
        try {
          fs.unlinkSync(tempScript);
        } catch (cleanupError) {
          console.log('Error cleaning up temp file:', cleanupError);
        }

        if (error) {
          console.log('AppleScript import automation failed:', error);
        } else {
          console.log('Import automated successfully:', stdout);
        }
      });

    } catch (error) {
      console.log('Error with import automation:', error);
    }

    return {
      success: true,
      message: `Markers file created successfully${frameRateInfo} at:\n${filePath}\n\nAutomatically importing to Logic Pro...`
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
  let earliestTime = null;

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

    // Track earliest time
    if (earliestTime === null || time < earliestTime) {
      earliestTime = time;
    }

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

  // Calculate start timecode from earliest marker time
  let startTimecode = '00 00 00 00'; // Default
  if (earliestTime !== null) {
    const hours = Math.floor(earliestTime / 3600);
    const startHour = Math.floor(hours); // Round down to nearest hour
    startTimecode = String(startHour).padStart(2, '0') + ' 00 00 00';
    console.log('Calculated start timecode:', startTimecode, 'from earliest time:', earliestTime, 'seconds');
  }

  return { markers, startTimecode };
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
