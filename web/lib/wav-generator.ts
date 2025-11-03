/**
 * WAV File Generator with Embedded Markers
 * Ported from wav-generator.js for web app use
 * Generates BWF (Broadcast Wave Format) compliant files
 */

import { Marker } from './csv-parser';

/**
 * Generate a WAV file buffer with embedded markers (cue points)
 */
export async function generateWavWithMarkers(markers: Marker[]): Promise<Buffer> {
  // Audio parameters
  const sampleRate = 44100;
  const numChannels = 2;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;

  // Calculate duration (last marker time + 1 second)
  const duration = markers.length > 0 ? Math.ceil(markers[markers.length - 1].time) + 1 : 10;
  const numSamples = duration * sampleRate;

  // Create buffers for different chunks
  const fmtChunk = createFmtChunk(sampleRate, numChannels, bitsPerSample);
  const bextChunk = createBextChunk();
  const cueChunk = createCueChunk(markers, sampleRate);
  const listChunk = createListChunk(markers);
  const dataChunk = createDataChunk(numSamples, numChannels, bytesPerSample);

  // Calculate total file size
  const fileSize = 4 + // 'WAVE'
    8 + fmtChunk.length + // 'fmt ' + size + data
    8 + bextChunk.length + // 'bext' + size + data
    8 + dataChunk.length + // 'data' + size + data
    8 + cueChunk.length + // 'cue ' + size + data
    8 + listChunk.length; // 'LIST' + size + data

  // Create RIFF header
  const riffHeader = Buffer.alloc(12);
  riffHeader.write('RIFF', 0);
  riffHeader.writeUInt32LE(fileSize, 4);
  riffHeader.write('WAVE', 8);

  // Combine all chunks
  const chunks = [
    riffHeader,
    createChunkHeader('fmt ', fmtChunk.length), fmtChunk,
    createChunkHeader('bext', bextChunk.length), bextChunk,
    createChunkHeader('data', dataChunk.length), dataChunk,
    createChunkHeader('cue ', cueChunk.length), cueChunk,
    createChunkHeader('LIST', listChunk.length), listChunk
  ];

  return Buffer.concat(chunks);
}

function createChunkHeader(id: string, size: number): Buffer {
  const header = Buffer.alloc(8);
  header.write(id, 0);
  header.writeUInt32LE(size, 4);
  return header;
}

function createFmtChunk(sampleRate: number, numChannels: number, bitsPerSample: number): Buffer {
  const chunk = Buffer.alloc(16);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;

  chunk.writeUInt16LE(1, 0); // Audio format (1 = PCM)
  chunk.writeUInt16LE(numChannels, 2); // Number of channels
  chunk.writeUInt32LE(sampleRate, 4); // Sample rate
  chunk.writeUInt32LE(byteRate, 8); // Byte rate
  chunk.writeUInt16LE(blockAlign, 12); // Block align
  chunk.writeUInt16LE(bitsPerSample, 14); // Bits per sample

  return chunk;
}

function createBextChunk(): Buffer {
  // Broadcast Wave Format Extension chunk (602 bytes minimum)
  const chunk = Buffer.alloc(602);

  // Description (256 bytes)
  const description = 'CueSynch Web - Generated marker file';
  chunk.write(description, 0, 256);

  // Originator (32 bytes)
  const originator = 'CueSynch Web';
  chunk.write(originator, 256, 32);

  // OriginatorReference (32 bytes)
  const originatorRef = `CSV2LOGIC${Date.now()}`;
  chunk.write(originatorRef, 288, 32);

  // OriginationDate (10 bytes) - format: yyyy:mm:dd
  const date = new Date();
  const originationDate = `${date.getFullYear()}:${String(date.getMonth() + 1).padStart(2, '0')}:${String(date.getDate()).padStart(2, '0')}`;
  chunk.write(originationDate, 320, 10);

  // OriginationTime (8 bytes) - format: hh:mm:ss
  const originationTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  chunk.write(originationTime, 330, 8);

  // TimeReference (8 bytes: low 4 bytes + high 4 bytes)
  // TimeReference = 0 means the file starts at timeline position 00:00:00:00
  const timeReferenceLow = 0;
  const timeReferenceHigh = 0;
  chunk.writeUInt32LE(timeReferenceLow, 338);
  chunk.writeUInt32LE(timeReferenceHigh, 342);

  // Version (2 bytes) - BWF version
  chunk.writeUInt16LE(2, 346);

  return chunk;
}

function createCueChunk(markers: Marker[], sampleRate: number): Buffer {
  const numCuePoints = markers.length;
  const chunk = Buffer.alloc(4 + numCuePoints * 24);

  // Write number of cue points
  chunk.writeUInt32LE(numCuePoints, 0);

  // Write each cue point
  let offset = 4;
  markers.forEach((marker, index) => {
    const samplePosition = Math.floor(marker.time * sampleRate);

    chunk.writeUInt32LE(index + 1, offset); // Cue point ID
    chunk.writeUInt32LE(samplePosition, offset + 4); // Position
    chunk.write('data', offset + 8); // Data chunk ID
    chunk.writeUInt32LE(0, offset + 12); // Chunk start
    chunk.writeUInt32LE(0, offset + 16); // Block start
    chunk.writeUInt32LE(samplePosition, offset + 20); // Sample offset

    offset += 24;
  });

  return chunk;
}

function createListChunk(markers: Marker[]): Buffer {
  // Create adtl (associated data list) chunk with labl (label) subchunks
  const subChunks: Buffer[] = [];

  markers.forEach((marker, index) => {
    const label = marker.name;
    const labelByteLength = Buffer.byteLength(label, 'utf8');
    const labelLength = labelByteLength + 1; // +1 for null terminator
    const paddedLength = labelLength + (labelLength % 2); // Pad to even length

    const subChunk = Buffer.alloc(8 + 4 + paddedLength);
    subChunk.write('labl', 0); // Subchunk ID
    subChunk.writeUInt32LE(4 + paddedLength, 4); // Subchunk size
    subChunk.writeUInt32LE(index + 1, 8); // Cue point ID
    subChunk.write(label, 12); // Label text
    subChunk.writeUInt8(0, 12 + labelByteLength); // Null terminator

    subChunks.push(subChunk);
  });

  const subChunksBuffer = Buffer.concat(subChunks);
  const listChunk = Buffer.alloc(4 + subChunksBuffer.length);
  listChunk.write('adtl', 0); // List type
  subChunksBuffer.copy(listChunk, 4);

  return listChunk;
}

function createDataChunk(numSamples: number, numChannels: number, bytesPerSample: number): Buffer {
  // Create silent audio data
  const dataSize = numSamples * numChannels * bytesPerSample;
  return Buffer.alloc(dataSize); // All zeros = silence
}
