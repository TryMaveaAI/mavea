// Encode the captured spoken track (mono Int16 PCM) into a WAV blob the scrubber can replay
// through an <audio> element. An <audio> element gives us `preservesPitch`, which an
// AudioBufferSourceNode lacks — so playback speed can change without chipmunking the voice.

/** Bytes of a 16-bit PCM mono WAV for `pcm` at `sampleRate`. The samples ARE the data chunk —
 *  the recorder keeps the source ints, so the replay WAV is byte-for-byte what was heard. */
export function pcmToWavBytes(pcm: Int16Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2; // 16-bit
  const dataSize = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  // RIFF header
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true); // file size minus the first 8 bytes
  writeAscii(8, 'WAVE');

  // fmt chunk (PCM)
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // audio format: 1 = PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  // data chunk
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < pcm.length; i++) view.setInt16(44 + i * bytesPerSample, pcm[i], true);

  return buffer;
}

/** A blob: URL for the WAV of `pcm`. Caller owns it — revoke with URL.revokeObjectURL when done. */
export function pcmToWavBlobUrl(pcm: Int16Array, sampleRate: number): string {
  const blob = new Blob([pcmToWavBytes(pcm, sampleRate)], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}
