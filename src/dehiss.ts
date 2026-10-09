// Breath reduction: tames hiss and airy high frequencies with a high-shelf cut above ~3 kHz (up to -15 dB) plus a
// gentle low-pass. Plain JavaScript (no Web Audio), so it also runs in workers and Node.
//
// The filters use the same formulas as the Web Audio API's BiquadFilterNode (Audio EQ Cookbook, high-shelf with
// slope 1, low-pass Q in dB), so the result matches jp-tts-playground's OfflineAudioContext version.

/** One biquad section over the whole signal (direct form I). */
function biquad(x: Float32Array, [b0, b1, b2, a0, a1, a2]: number[]) {
  const y = new Float32Array(x.length);
  const nb0 = b0 / a0, nb1 = b1 / a0, nb2 = b2 / a0, na1 = a1 / a0, na2 = a2 / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = nb0 * x[i] + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

function highShelf(sampleRate: number, frequency: number, gainDb: number) {
  const A = 10 ** (gainDb / 40), w0 = (2 * Math.PI * frequency) / sampleRate;
  const cw = Math.cos(w0), alpha = (Math.sin(w0) / 2) * Math.SQRT2; // slope S = 1
  const k = 2 * Math.sqrt(A) * alpha;
  return [
    A * ((A + 1) + (A - 1) * cw + k), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - k),
    (A + 1) - (A - 1) * cw + k, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - k,
  ];
}

function lowPass(sampleRate: number, frequency: number, qDb: number) {
  const w0 = (2 * Math.PI * frequency) / sampleRate, cw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * 10 ** (qDb / 20)); // Web Audio's low-pass Q is in dB
  return [(1 - cw) / 2, 1 - cw, (1 - cw) / 2, 1 + alpha, -2 * cw, 1 - alpha];
}

/**
 * @param {Float32Array} samples  mono
 * @param {number} amount  0..1 (0 = unchanged)
 * @returns {Float32Array}
 */
export function reduceBreath(samples: Float32Array, sampleRate: number, amount: number) {
  if (!amount) return samples;
  const shelved = biquad(samples, highShelf(sampleRate, 3000, -15 * amount));
  return biquad(shelved, lowPass(sampleRate, Math.min(sampleRate / 2 - 100, 10000 - 4000 * amount), 0.5));
}
