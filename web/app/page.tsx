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
        // Auto-select all non-time columns as marker fields
        const otherFields = data.headers.filter(h => h !== data.detectedTimeColumn);
        setSelectedFields(otherFields);
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
        <div className="bg-slate-800 rounded-lg p-6 mb-6 border border-slate-700">
          <label className="block mb-2 font-semibold text-slate-200">Frame Rate</label>
          <select
            value={frameRate}
            onChange={(e) => setFrameRate(e.target.value)}
            className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className={`bg-slate-800 rounded-lg p-12 mb-6 border-2 border-dashed transition-all cursor-pointer ${
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
                <div className="text-4xl mb-4">✓</div>
                <p className="text-xl font-semibold text-green-400 mb-2">{file.name}</p>
                <p className="text-slate-400">Click to choose a different file</p>
              </>
            ) : (
              <>
                <div className="text-6xl mb-4">📁</div>
                <p className="text-xl font-semibold mb-2">Drop CSV file here</p>
                <p className="text-slate-400">or click to browse</p>
              </>
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Analyzing State */}
        {isAnalyzing && (
          <div className="bg-slate-800 rounded-lg p-6 mb-6 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-slate-300">Analyzing CSV...</p>
          </div>
        )}

        {/* Field Selection */}
        {csvData?.success && csvData.headers && (
          <div className="bg-slate-800 rounded-lg p-6 mb-6 border border-slate-700">
            <h2 className="text-2xl font-bold mb-6">Configure Markers</h2>

            {/* Time Column Selection */}
            <div className="mb-6">
              <label className="block mb-2 font-semibold text-slate-200">Time Column</label>
              <select
                value={timeColumn}
                onChange={(e) => setTimeColumn(e.target.value)}
                className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {csvData.headers.map(header => (
                  <option key={header} value={header}>{header}</option>
                ))}
              </select>
              <p className="text-sm text-slate-400 mt-2">
                Detected frame rate: {csvData.frameRate} fps
              </p>
            </div>

            {/* Marker Fields Selection */}
            <div className="mb-6">
              <label className="block mb-2 font-semibold text-slate-200">Marker Fields</label>
              <p className="text-sm text-slate-400 mb-3">Select columns to include in marker names</p>
              <div className="space-y-2">
                {csvData.headers
                  .filter(h => h !== timeColumn)
                  .map(header => (
                    <label
                      key={header}
                      className="flex items-center p-3 bg-slate-700 rounded-lg cursor-pointer hover:bg-slate-600 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFields.includes(header)}
                        onChange={() => toggleField(header)}
                        className="w-5 h-5 mr-3 accent-blue-500"
                      />
                      <span>{header}</span>
                    </label>
                  ))}
              </div>
            </div>

            {/* Preview */}
            {selectedFields.length > 0 && csvData.rows && csvData.rows.length > 0 && (
              <div className="bg-slate-700 rounded-lg p-4">
                <p className="text-sm text-slate-400 mb-2">Preview (first marker):</p>
                <p className="font-mono text-blue-300">{getPreview()}</p>
              </div>
            )}
          </div>
        )}

        {/* Generate Button */}
        {csvData?.success && (
          <button
            onClick={handleGenerateWAV}
            disabled={isGenerating || selectedFields.length === 0}
            className={`w-full p-4 rounded-lg font-bold text-lg transition-all ${
              isGenerating || selectedFields.length === 0
                ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg hover:shadow-xl'
            }`}
          >
            {isGenerating ? (
              <span className="flex items-center justify-center">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-white mr-3"></div>
                Generating WAV...
              </span>
            ) : (
              'Generate & Download WAV'
            )}
          </button>
        )}

        {/* Instructions */}
        {csvData?.success && (
          <div className="mt-8 bg-slate-800 rounded-lg p-6 border border-slate-700">
            <h3 className="text-xl font-bold mb-4">Next Steps</h3>
            <ol className="space-y-3 text-slate-300">
              <li className="flex items-start">
                <span className="font-bold text-blue-400 mr-3">1.</span>
                <span>Download the generated WAV file</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-blue-400 mr-3">2.</span>
                <span>Open Logic Pro with your project</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-blue-400 mr-3">3.</span>
                <span>Go to <strong>Navigate &gt; Other &gt; Import Marker from Audio File</strong></span>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-blue-400 mr-3">4.</span>
                <span>Select the downloaded WAV file</span>
              </li>
              <li className="flex items-start">
                <span className="font-bold text-blue-400 mr-3">5.</span>
                <span>Markers will appear at their correct timestamps!</span>
              </li>
            </ol>
          </div>
        )}
      </div>
    </main>
  );
}
