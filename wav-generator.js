const fs = require('fs');

/**
 * Generate a WAV file with embedded markers (cue points)
 * @param {Array} markers - Array of {time: number, name: string}
 * @param {string} outputPath - Path to save the WAV file
 */
async function generateWavWithMarkers(markers, outputPath) {
  // Audio parameters
  const sampleRate = 44100;
  const numChannels = 2;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;

  // Calculate duration (last marker time + 1 second)
  // Note: marker times already include SMPTE offset, so this creates a file long enough
  const duration = markers.length > 0 ? Math.ceil(markers[markers.length - 1].time) + 1 : 10;
  const numSamples = duration * sampleRate;

  console.log('=== WAV FILE GENERATION ===');
  console.log('Audio duration:', duration, 'seconds');
  console.log('Total samples:', numSamples);
  console.log('File will contain', Math.floor(duration / 3600), 'hours', Math.floor((duration % 3600) / 60), 'minutes', Math.floor(duration % 60), 'seconds of audio');

  // Create buffers for different chunks
  const fmtChunk = createFmtChunk(sampleRate, numChannels, bitsPerSample);
  const bextChunk = createBextChunk(); // BWF metadata for timeline positioning
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

  // Write all chunks to file
  // Chunk order: fmt → bext → data → cue → LIST
  // bext chunk contains BWF TimeReference telling Logic where the file sits on the timeline
  const chunks = [
    riffHeader,
    createChunkHeader('fmt ', fmtChunk.length), fmtChunk,
    createChunkHeader('bext', bextChunk.length), bextChunk,
    createChunkHeader('data', dataChunk.length), dataChunk,
    createChunkHeader('cue ', cueChunk.length), cueChunk,
    createChunkHeader('LIST', listChunk.length), listChunk
  ];

  const wavBuffer = Buffer.concat(chunks);
  fs.writeFileSync(outputPath, wavBuffer);
}

function createChunkHeader(id, size) {
  const header = Buffer.alloc(8);
  header.write(id, 0);
  header.writeUInt32LE(size, 4);
  return header;
}

function createFmtChunk(sampleRate, numChannels, bitsPerSample) {
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

function createBextChunk() {
  // Broadcast Wave Format Extension chunk (602 bytes minimum)
  const chunk = Buffer.alloc(602);

  console.log('=== CREATING BEXT CHUNK (Broadcast Wave Format) ===');

  // Description (256 bytes) - null-terminated string
  const description = 'CueSynch - Generated marker file';
  chunk.write(description, 0, 256);

  // Originator (32 bytes) - who created the file
  const originator = 'CueSynch';
  chunk.write(originator, 256, 32);

  // OriginatorReference (32 bytes) - unique identifier
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
  // This is the key field - tells Logic where the audio file sits on the timeline
  // TimeReference = 0 means the file starts at timeline position 00:00:00:00
  const timeReferenceLow = 0;
  const timeReferenceHigh = 0;
  chunk.writeUInt32LE(timeReferenceLow, 338); // Low 32 bits
  chunk.writeUInt32LE(timeReferenceHigh, 342); // High 32 bits

  console.log('TimeReference: 0 (audio file starts at timeline position 00:00:00:00)');

  // Version (2 bytes) - BWF version (1 or 2)
  chunk.writeUInt16LE(2, 346);

  // UMID (64 bytes) - Unique Material Identifier (optional, zeros if not used)
  // Already zeros from Buffer.alloc

  // Reserved (190 bytes) - reserved for future use
  // Already zeros from Buffer.alloc

  // CodingHistory (variable) - null-terminated string describing processing
  // Minimum: just a null terminator (already zero from Buffer.alloc)

  console.log('BWF bext chunk created (602 bytes)');
  console.log('Origination Date/Time:', originationDate, originationTime);

  return chunk;
}

function createCueChunk(markers, sampleRate) {
  const numCuePoints = markers.length;
  const chunk = Buffer.alloc(4 + numCuePoints * 24);

  console.log('=== CREATING CUE CHUNK ===');
  console.log('Sample Rate:', sampleRate);
  console.log('Number of cue points:', numCuePoints);

  // Write number of cue points
  chunk.writeUInt32LE(numCuePoints, 0);

  // Write each cue point
  let offset = 4;
  markers.forEach((marker, index) => {
    const samplePosition = Math.floor(marker.time * sampleRate);

    console.log(`\nMarker ${index + 1}: "${marker.name}" at ${marker.time}s → sample ${samplePosition}`);

    chunk.writeUInt32LE(index + 1, offset); // Cue point ID
    chunk.writeUInt32LE(samplePosition, offset + 4); // Position (sample position in play order)
    chunk.write('data', offset + 8); // Data chunk ID
    chunk.writeUInt32LE(0, offset + 12); // Chunk start (for compressed files)
    chunk.writeUInt32LE(0, offset + 16); // Block start (for compressed files)
    chunk.writeUInt32LE(samplePosition, offset + 20); // Sample offset

    // Log the hex dump of this cue point
    logCuePointHex(chunk, offset, index + 1, samplePosition);

    offset += 24;
  });

  console.log('\n=== CUE CHUNK HEX DUMP ===');
  console.log(formatHexDump(chunk));

  return chunk;
}

function logCuePointHex(buffer, offset, cueId, samplePos) {
  console.log('  Cue Point Structure (24 bytes):');
  console.log(`    [00-03] ID:           ${buffer.readUInt32LE(offset).toString().padStart(10)} (0x${buffer.readUInt32LE(offset).toString(16).padStart(8, '0')})`);
  console.log(`    [04-07] Position:     ${buffer.readUInt32LE(offset + 4).toString().padStart(10)} (0x${buffer.readUInt32LE(offset + 4).toString(16).padStart(8, '0')})`);
  console.log(`    [08-11] Chunk ID:     ${buffer.toString('ascii', offset + 8, offset + 12)}`);
  console.log(`    [12-15] Chunk Start:  ${buffer.readUInt32LE(offset + 12).toString().padStart(10)} (0x${buffer.readUInt32LE(offset + 12).toString(16).padStart(8, '0')})`);
  console.log(`    [16-19] Block Start:  ${buffer.readUInt32LE(offset + 16).toString().padStart(10)} (0x${buffer.readUInt32LE(offset + 16).toString(16).padStart(8, '0')})`);
  console.log(`    [20-23] Sample Offs:  ${buffer.readUInt32LE(offset + 20).toString().padStart(10)} (0x${buffer.readUInt32LE(offset + 20).toString(16).padStart(8, '0')})`);
}

function formatHexDump(buffer) {
  let output = '';
  for (let i = 0; i < buffer.length; i += 16) {
    const offset = i.toString(16).padStart(8, '0');
    const hexBytes = [];
    const asciiBytes = [];

    for (let j = 0; j < 16 && (i + j) < buffer.length; j++) {
      const byte = buffer[i + j];
      hexBytes.push(byte.toString(16).padStart(2, '0'));
      asciiBytes.push(byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.');
    }

    output += `${offset}  ${hexBytes.join(' ').padEnd(47)}  ${asciiBytes.join('')}\n`;
  }
  return output;
}

function createListChunk(markers) {
  // Create adtl (associated data list) chunk with labl (label) subchunks
  const subChunks = [];

  markers.forEach((marker, index) => {
    const label = marker.name;
    const labelLength = Buffer.byteLength(label, 'utf8') + 1; // +1 for null terminator
    const paddedLength = labelLength + (labelLength % 2); // Pad to even length

    // Buffer needs: 4 (chunk ID) + 4 (size) + 4 (cue ID) + paddedLength (label + null + padding)
    const subChunk = Buffer.alloc(8 + 4 + paddedLength);
    subChunk.write('labl', 0); // Subchunk ID
    subChunk.writeUInt32LE(4 + paddedLength, 4); // Subchunk size (cue ID + label data)
    subChunk.writeUInt32LE(index + 1, 8); // Cue point ID
    subChunk.write(label, 12); // Label text
    subChunk.writeUInt8(0, 12 + label.length); // Null terminator right after label

    subChunks.push(subChunk);
  });

  const subChunksBuffer = Buffer.concat(subChunks);
  const listChunk = Buffer.alloc(4 + subChunksBuffer.length);
  listChunk.write('adtl', 0); // List type
  subChunksBuffer.copy(listChunk, 4);

  return listChunk;
}

function createDataChunk(numSamples, numChannels, bytesPerSample) {
  // Create silent audio data
  const dataSize = numSamples * numChannels * bytesPerSample;
  return Buffer.alloc(dataSize); // All zeros = silence
}

module.exports = { generateWavWithMarkers };
