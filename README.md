# CueSynch

macOS app that converts CSV timecode files to BWF (Broadcast Wave Format) audio files with embedded markers for Logic Pro.

## Features

- Multiple timecode formats: seconds, MM:SS, HH:MM:SS, HH:MM:SS:FF
- Smart frame rate detection (24, 25, 30, 50, 60 fps)
- Multi-column CSV support with field selection
- BWF TimeReference for accurate timeline positioning
- Works with Logic Pro's SMPTE offset settings

## Installation

1. Install dependencies:
```bash
npm install
```

## Usage

1. Start the app:
```bash
npm start
```

2. Select a frame rate (or leave on "Auto Detect" for smart detection)

3. Drag and drop a CSV file onto the app window (or click to browse)

4. **Select time column and fields**:
   - **Time Column**: Choose which column contains the timecode/time data (automatically detected but can be changed)
   - **Marker Fields**: Select which columns to include in the marker names
   - Selected fields will be joined with " - " in the marker name
   - Preview shows how the first marker will look in real-time

5. Choose where to save the generated WAV file

6. Import the WAV file into Logic Pro:
   - Open your Logic Pro project
   - Go to **Navigate > Other > Import Marker from Audio File**
   - Select the generated WAV file
   - Markers should now appear at their correct timestamps

## CSV Format

Your CSV file can have multiple columns. The app will automatically detect the time column and let you choose which other columns to include in marker names.

### Simple Format (two columns)
```csv
time,name
0,Intro
10.5,Verse 1
1:30,Chorus
0:01:45:15,Bridge
```

### Multi-Column Format
```csv
time,scene,shot,description,notes
0:00:00:00,Scene 1,Shot 1A,Opening wide shot,Sunrise lighting
0:00:10:15,Scene 1,Shot 1B,Close-up on actor,Dramatic zoom
0:00:45:00,Scene 2,Shot 2A,Establishing shot,City skyline
```

When you import a multi-column CSV, you can select which fields to include. For example, selecting "scene" and "shot" would create markers like: `Scene 1 - Shot 1A`

### Complex CSV with Multiple Timecode Columns

Some workflows (like video review tools) export CSVs with multiple timecode columns:

```csv
Frame,Timecode,Timecode In,Timecode Out,Timecode Source In,Annotation
13,00:00:00:12,00:00:00:12,00:00:00:12,00:00:00:12,Opening shot
88,00:00:03:15,00:00:03:15,00:00:03:15,00:00:03:15,First dialogue
```

The app lets you:
1. **Choose which timecode column** to use (e.g., "Timecode In" for marker positions)
2. **Select other columns** for the marker names (e.g., "Frame" and "Annotation")
3. The time column is automatically detected but you can change it in the dropdown

Time formats supported:
- **Seconds**: `10.5`
- **MM:SS**: `1:30`
- **HH:MM:SS**: `0:01:45`
- **HH:MM:SS:FF** (with frames): `0:01:45:15`

### Frame Rate Support

When using timecodes with frames (HH:MM:SS:FF format), you can:

1. **Auto Detect** (default): The app intelligently detects the frame rate based on the frame values in your CSV
   - Frame values 0-23 → 24 fps (Film)
   - Frame values 0-24 → 25 fps (PAL)
   - Frame values 0-29 → 30 fps (NTSC)
   - Frame values 0-49 → 50 fps
   - Frame values 0-59 → 60 fps

2. **Manual Selection**: Choose a specific frame rate from the dropdown:
   - 23.976 fps (Film)
   - 24 fps (Film)
   - 25 fps (PAL)
   - 29.97 fps (NTSC drop-frame)
   - 30 fps (NTSC)
   - 50 fps
   - 60 fps

Sample CSV files included:
- `sample.csv` - Basic time formats (seconds, MM:SS, HH:MM:SS)
- `sample-with-frames.csv` - Frame-based timecodes (HH:MM:SS:FF)
- `sample-multi-column.csv` - Multi-column format for video production
- `sample-complex-timecodes.csv` - Multiple timecode columns (like video review tools)

## Building the App

To build a standalone macOS app:

```bash
npm run build
```

The built app will be in the `dist` folder.

## Technical Details

Generates BWF-compliant WAV files with:
- **Cue chunks**: WAV markers at CSV timecode positions
- **LIST/adtl chunks**: Marker labels from selected CSV fields
- **bext chunk**: BWF TimeReference for accurate timeline positioning

Logic Pro reads the BWF TimeReference to position the file at timeline 00:00:00:00, then places markers at their correct positions relative to your project's SMPTE offset.

## Troubleshooting

### Markers at wrong positions

The app uses BWF TimeReference to ensure correct positioning. Markers appear at CSV timecodes + your project's SMPTE offset.

Example: CSV marker `00:00:10:00` + project start `01:00:00:00` = marker at `01:00:10:00`

If markers are still incorrect, verify your project sample rate matches 44.1kHz.

### Import issues

Use **Navigate > Other > Import Marker from Audio File** in Logic Pro. Test WAV files in Audacity first to verify cue points are embedded correctly.
