// Audio to a WAV file (16-bit mono PCM).

/**
 * @param {{ samples: Float32Array, sampleRate: number }} audio
 * @returns {Blob}  type audio/wav
 */
export function toWav({ samples, sampleRate }: import("./types.js").Audio) {
  const n = samples.length;
  const view = new DataView(new ArrayBuffer(44 + n * 2));
  const ascii = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  ascii(0, "RIFF"); view.setUint32(4, 36 + n * 2, true); ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, "data"); view.setUint32(40, n * 2, true);
  for (let i = 0, o = 44; i < n; i++, o += 2) view.setInt16(o, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([view], { type: "audio/wav" });
}
