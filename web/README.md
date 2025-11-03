# CueSynch Web - Phase 1

Web-based version of CueSynch for converting CSV timecodes to BWF WAV marker files.

## Features

- **Zero Installation**: Just visit the URL, no app download required
- **Drag & Drop**: Simple file upload interface
- **Auto-Detection**: Automatically detects time column and frame rate
- **Field Selection**: Choose which CSV columns to include in marker names
- **Real-time Preview**: See how markers will look before generating
- **Instant Download**: Generate and download WAV file in seconds

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Testing

Sample CSV files are available in the parent directory:
- `sample.csv` - Basic time formats
- `sample-multi-column.csv` - Multi-column format
- `sample-with-frames.csv` - Frame-based timecodes
- `sample-complex-timecodes.csv` - Multiple timecode columns

## How It Works

1. **Upload CSV**: Drag and drop or click to select a CSV file
2. **Auto-Analysis**: App analyzes CSV structure and detects:
   - Column headers
   - Time column (auto-detected)
   - Frame rate (if using HH:MM:SS:FF format)
3. **Configure Markers**:
   - Select time column
   - Choose which fields to include in marker names
   - See real-time preview
4. **Generate WAV**: Click button to generate and download WAV file
5. **Import to Logic Pro**:
   - Navigate > Other > Import Marker from Audio File
   - Select the downloaded WAV file

## Technical Stack

- **Frontend**: Next.js 15 with React Server Components
- **API Routes**: Next.js API routes for file processing
- **Styling**: Tailwind CSS
- **Processing**:
  - CSV parsing in `/lib/csv-parser.ts`
  - WAV generation in `/lib/wav-generator.ts`

## API Routes

### POST /api/analyze-csv
Analyzes uploaded CSV file and returns structure info.

**Request:**
- `file`: CSV file (multipart/form-data)
- `frameRate`: Frame rate setting ('auto' or number)

**Response:**
```json
{
  "success": true,
  "headers": ["time", "name", "description"],
  "rows": [{...}, {...}],
  "frameRate": 30,
  "detectedTimeColumn": "time"
}
```

### POST /api/generate-wav
Generates BWF WAV file with embedded markers.

**Request:**
- `file`: CSV file (multipart/form-data)
- `frameRate`: Number
- `timeColumn`: Column name containing timecodes
- `selectedFields`: JSON array of field names for marker labels

**Response:**
- Binary WAV file download

## File Structure

```
web/
├── app/
│   ├── api/
│   │   ├── analyze-csv/
│   │   │   └── route.ts       # CSV analysis endpoint
│   │   └── generate-wav/
│   │       └── route.ts       # WAV generation endpoint
│   ├── layout.tsx             # Root layout
│   ├── page.tsx               # Main UI
│   └── globals.css            # Global styles
├── lib/
│   ├── csv-parser.ts          # CSV parsing utilities
│   └── wav-generator.ts       # WAV file generation
└── public/                    # Static assets
```

## Deployment

Ready to deploy to Vercel:

```bash
# Build for production
npm run build

# Or deploy to Vercel
vercel deploy
```

## Next Steps (Phase 2)

See `WEB_APP_PLAN.md` in parent directory for:
- Option 2: Hybrid web + local helper app for auto-import
- Option 3: Full serverless with desktop agent

## License

Same as parent CueSynch project
