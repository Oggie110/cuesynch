import { NextRequest, NextResponse } from 'next/server';
import { parseCSVWithHeaders, detectFrameRate, detectTimeColumn } from '@/lib/csv-parser';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const frameRateParam = formData.get('frameRate') as string;

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'No file provided' },
        { status: 400 }
      );
    }

    // Read file content
    const csvContent = await file.text();

    // Detect frame rate if set to 'auto'
    let detectedFrameRate: number;
    if (frameRateParam === 'auto') {
      detectedFrameRate = detectFrameRate(csvContent);
    } else {
      detectedFrameRate = parseFloat(frameRateParam);
    }

    // Parse CSV
    const { headers, rows } = parseCSVWithHeaders(csvContent);

    // Auto-detect time column
    const timeColumn = detectTimeColumn(headers);

    return NextResponse.json({
      success: true,
      headers,
      rows: rows.slice(0, 5), // Return first 5 rows as preview
      frameRate: detectedFrameRate,
      detectedTimeColumn: timeColumn
    });
  } catch (error) {
    console.error('CSV analysis error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to analyze CSV'
      },
      { status: 500 }
    );
  }
}
