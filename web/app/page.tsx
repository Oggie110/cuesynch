'use client';

import { useState, useRef } from 'react';

interface CSVRow {
  [key: string]: string;
}

interface AnalyzeResponse {
  success: boolean;
  headers?: string[];
  rows?: CSVRow[];
  frameRate?: number;
  detectedTimeColumn?: string;
  message?: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [frameRate, setFrameRate] = useState<string>('auto');
  const [csvData, setCSVData] = useState<AnalyzeResponse | null>(null);
  const [timeColumn, setTimeColumn] = useState<string>('');
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError('');
    setCSVData(null);
    setTimeColumn('');
    setSelectedFields([]);

    // Auto-analyze the CSV
    await analyzeCSV(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.csv')) {
      handleFileSelect(droppedFile);
    }
  };

  const analyzeCSV = async (fileToAnalyze: File) => {
    setIsAnalyzing(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', fileToAnalyze);
      formData.append('frameRate', frameRate);

      const response = await fetch('/api/analyze-csv', {
        method: 'POST',
        body: formData,
      });

      const data: AnalyzeResponse = await response.json();

      if (data.success && data.headers) {
        setCSVData(data);
        setTimeColumn(data.detectedTimeColumn || data.headers[0]);
        // Start with no fields selected
        setSelectedFields([]);
      } else {
        setError(data.message || 'Failed to analyze CSV');
      }
    } catch (err) {
      setError('Failed to analyze CSV file');
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateWAV = async () => {
    if (!file || !timeColumn || selectedFields.length === 0) {
      setError('Please select time column and at least one marker field');
      return;
    }

    setIsGenerating(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('frameRate', csvData?.frameRate?.toString() || '30');
      formData.append('timeColumn', timeColumn);
      formData.append('selectedFields', JSON.stringify(selectedFields));

      const response = await fetch('/api/generate-wav', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        // Download the file
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'marker_list.wav';
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const data = await response.json();
        setError(data.message || 'Failed to generate WAV file');
      }
    } catch (err) {
      setError('Failed to generate WAV file');
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleField = (field: string) => {
    setSelectedFields(prev =>
      prev.includes(field)
        ? prev.filter(f => f !== field)
        : [...prev, field]
    );
  };

  const getPreview = () => {
    if (!csvData?.rows || csvData.rows.length === 0) return '';
    const row = csvData.rows[0];
    const parts = selectedFields.map(field => row[field]).filter(Boolean);
    return parts.join(' - ') || 'Marker';
  };

  const getTimecodePreview = () => {
    if (!csvData?.rows || csvData.rows.length === 0 || !timeColumn) return [];
    // Get first 3 timecode samples from the selected time column
    return csvData.rows.slice(0, 3).map(row => row[timeColumn]).filter(Boolean);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            CueSynch Web
          </h1>
          <p className="text-slate-300 text-lg">
            Convert CSV timecodes to WAV marker files for Logic Pro
          </p>
        </header>

        {/* Frame Rate Selector */}
        <div className="bg-slate-800 rounded-lg p-5 mb-5 border border-slate-700">
          <label className="block mb-1.5 font-semibold text-slate-200 text-sm">Frame Rate</label>
          <select
            value={frameRate}
            onChange={(e) => setFrameRate(e.target.value)}
            className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="auto">Auto Detect</option>
            <option value="23.976">23.976 fps (Film)</option>
            <option value="24">24 fps (Film)</option>
            <option value="25">25 fps (PAL)</option>
            <option value="29.97">29.97 fps (NTSC drop-frame)</option>
            <option value="30">30 fps (NTSC)</option>
            <option value="50">50 fps</option>
            <option value="60">60 fps</option>
          </select>
        </div>

        {/* File Upload */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className={`bg-slate-800 rounded-lg p-10 mb-5 border-2 border-dashed transition-all cursor-pointer ${
            file ? 'border-green-500' : 'border-slate-600 hover:border-blue-500'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
            className="hidden"
          />
          <div className="text-center">
            {file ? (
              <>
                <div className="text-3xl mb-3">✓</div>
                <p className="text-lg font-semibold text-green-400 mb-1.5">{file.name}</p>
                <p className="text-slate-400 text-sm">Click to choose a different file</p>
              </>
            ) : (
              <>
                <div className="text-5xl mb-3">📁</div>
                <p className="text-lg font-semibold mb-1.5">Drop CSV file here</p>
                <p className="text-slate-400 text-sm">or click to browse</p>
              </>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500 rounded-lg p-3 mb-5">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Analyzing State */}
        {isAnalyzing && (
          <div className="bg-slate-800 rounded-lg p-5 mb-5 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mb-3"></div>
            <p className="text-slate-300 text-sm">Analyzing CSV...</p>
          </div>
        )}

        {/* Field Selection */}
        {csvData?.success && csvData.headers && (
          <div className="bg-slate-800 rounded-lg p-5 mb-5 border border-slate-700">
            <h2 className="text-xl font-bold mb-5">Configure Markers</h2>

            {/* Time Column Selection */}
            <div className="mb-5">
              <label className="block mb-1.5 font-semibold text-slate-200 text-sm">Time Column</label>
              <select
                value={timeColumn}
                onChange={(e) => setTimeColumn(e.target.value)}
                className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {csvData.headers.map(header => (
                  <option key={header} value={header}>{header}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1.5">
                Detected frame rate: {csvData.frameRate} fps
              </p>
              {getTimecodePreview().length > 0 && (
                <div className="mt-2.5 bg-slate-700 rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-2.5">Sample timecodes:</p>
                  <div className="flex flex-wrap gap-2.5">
                    {getTimecodePreview().map((tc, idx) => (
                      <div key={idx} className="font-mono text-blue-300 text-sm">{tc}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Marker Fields Selection */}
            <div className="mb-5">
              <label className="block mb-1.5 font-semibold text-slate-200 text-sm">Marker Fields</label>
              <p className="text-xs text-slate-400 mb-2.5">Select columns to include in marker names</p>
              <div className="flex flex-wrap gap-1.5">
                {csvData.headers
                  .filter(h => h !== timeColumn)
                  .map(header => (
                    <label
                      key={header}
                      className={`inline-flex items-center px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-sm ${
                        selectedFields.includes(header)
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedFields.includes(header)}
                        onChange={() => toggleField(header)}
                        className="hidden"
                      />
                      <span>{header}</span>
                    </label>
                  ))}
              </div>
            </div>

            {/* Preview */}
            {selectedFields.length > 0 && csvData.rows && csvData.rows.length > 0 && (
              <div className="bg-slate-700 rounded-lg p-3">
                <p className="text-xs text-slate-400 mb-1.5">Preview (first marker):</p>
                <p className="font-mono text-blue-300 text-sm">{getPreview()}</p>
              </div>
            )}
          </div>
        )}

        {/* Generate Button */}
        {csvData?.success && (
          <button
            onClick={handleGenerateWAV}
            disabled={isGenerating || selectedFields.length === 0}
            className={`w-full p-3 rounded-lg font-bold text-base transition-all ${
              isGenerating || selectedFields.length === 0
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg hover:shadow-xl'
            }`}
          >
            {isGenerating ? (
              <span className="flex items-center justify-center">
                <div className="inline-block animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2.5"></div>
                Generating WAV...
              </span>
            ) : (
              'Generate & Download WAV'
            )}
          </button>
        )}

        {/* Instructions */}
        {csvData?.success && (
          <div className="mt-6 bg-slate-800 rounded-lg p-5 border border-slate-700">
            <h3 className="text-lg font-bold mb-3">Next Steps</h3>
            <ol className="space-y-2.5 text-slate-300 text-sm">
              <li className="flex items-start">
                <span className="font-bold text-blue-400 mr-2.5">1.</span>
                <span>Download the generated WAV file</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-blue-400 mr-2.5">2.</span>
                <span>Open Logic Pro with your project</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-blue-400 mr-2.5">3.</span>
                <span>Import the audio file to the correct position (e.g. <strong>01:00:00:00</strong> or <strong>00:00:00:00</strong>)</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-blue-400 mr-2.5">4.</span>
                <span>Go to <strong>Navigate &gt; Other &gt; Import Marker from Audio File</strong></span>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-blue-400 mr-2.5">5.</span>
                <span>Markers will appear at their correct timestamps!</span>
              </li>
            </ol>
            <div className="mt-4 bg-slate-700/50 rounded-lg p-3 border border-slate-600">
              <p className="text-xs text-slate-300">
                <strong className="text-slate-200">Note:</strong> This tool may also work with other DAWs and audio editors that support WAV marker metadata. It has been tested and confirmed to work with <strong>Adobe Audition</strong>, which automatically imports the marker metadata.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
