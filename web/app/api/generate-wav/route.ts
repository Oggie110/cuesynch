import { NextRequest, NextResponse } from 'next/server';
import { parseCSVWithSelectedFields } from '@/lib/csv-parser';
import { generateWavWithMarkers } from '@/lib/wav-generator';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const frameRate = parseFloat(formData.get('frameRate') as string);
    const timeColumn = formData.get('timeColumn') as string;
    const selectedFieldsJson = formData.get('selectedFields') as string;

    if (!file || !timeColumn || !selectedFieldsJson) {
      return NextResponse.json(
        { success: false, message: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const selectedFields = JSON.parse(selectedFieldsJson);

    // Read file content
    const csvContent = await file.text();

    // Parse CSV and generate markers
    const markers = parseCSVWithSelectedFields(
      csvContent,
      frameRate,
      timeColumn,
      selectedFields
    );

    if (markers.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No valid markers found in CSV' },
        { status: 400 }
      );
    }

    // Generate WAV file
    const wavBuffer = await generateWavWithMarkers(markers);

    // Generate filename
    const originalName = file.name.replace(/\.(csv|txt)$/i, '');
    const sanitized = originalName.replace(/[^a-z0-9_\-\s]/gi, '_').trim();
    const filename = sanitized ? `${sanitized}_marker_list.wav` : 'marker_list.wav';

    // Return WAV file (convert Buffer to Uint8Array for web standards compatibility)
    const uint8Array = new Uint8Array(wavBuffer);
    return new Response(uint8Array, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': wavBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('WAV generation error:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to generate WAV file'
      },
      { status: 500 }
    );
  }
}
