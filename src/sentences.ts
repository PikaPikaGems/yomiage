// Splitting text into the pieces that are synthesized one at a time, keeping where each piece is in the text (for
// onSentence highlighting). Short pieces keep the wait before the first sound short.

/** Longer sentences are cut after 、 or , so no single piece takes long to synthesize. */
export const MAX_CHARS = 40;

const ENDERS = "。！？!?…";
const OPEN = "「『（(［[【";
const CLOSE = "」』）)］]】";
const QUOTES = "\"”’'";
const JAPANESE = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]/;

/** True for a piece with letters but no Japanese at all (e.g. "Let's do our best!"). */
export const isOtherLanguage = (text: string) => !JAPANESE.test(text) && /\p{L}/u.test(text);

/**
 * Sentences: breaks after 。！？!?… (and "." followed by a space or the end, so "3.14" stays whole) plus any closing
 * quotes or brackets, and at every newline. Enders inside 「」『』（）etc. don't split, so 「行こう！」と彼は言った。 is one.
 * Pieces with no letters or digits (e.g. "……") are dropped.
 * @param {string} text
 * @returns {{ text: string, start: number, end: number }[]}  start/end: string indices, so text.slice(start, end)
 */
export function splitSentences(text: string) {
  const out: Array<{start: number; end: number; text?: string}> = [];
  let from = 0, depth = 0;
  const flush = (to: number) => {
    const raw = text.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    if (t && /[\p{L}\p{N}]/u.test(t)) out.push({ text: t, start: from + lead, end: from + lead + t.length });
    from = to;
    depth = 0;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\n") { flush(i); from = i + 1; continue; }
    if (OPEN.includes(c)) { depth++; continue; }
    if (CLOSE.includes(c)) { depth = Math.max(0, depth - 1); continue; }
    const next = text[i + 1];
    const ender = ENDERS.includes(c) || (c === "." && (next === undefined || /\s/.test(next)));
    if (!ender || depth > 0) continue;
    while (i + 1 < text.length && (ENDERS.includes(text[i + 1]) || CLOSE.includes(text[i + 1]) || QUOTES.includes(text[i + 1]) || text[i + 1] === ".")) i++;
    flush(i + 1);
  }
  flush(text.length);
  return out;
}

/**
 * Sentences, with long ones cut after 、，, so each piece is at most about MAX_CHARS characters. A piece with no
 * comma to cut at stays whole.
 * @param {string} text
 * @returns {{ text: string, start: number, end: number }[]}
 */
export function splitForSpeech(text: string, maxChars = MAX_CHARS) {
  const out: Array<{start: number; end: number; text?: string}> = [];
  for (const s of splitSentences(text)) {
    if (s.text!.length <= maxChars) { out.push(s); continue; }
    let piece: {start: number; end: number} | null = null;
    for (const m of s.text!.matchAll(/[^、，,]+[、，,]?/g)) {
      const start = s.start + m.index, end = start + m[0].length;
      if (piece && end - piece.start > maxChars) { out.push(piece); piece = null; }
      piece = { start: piece ? piece.start : start, end };
    }
    if (piece) out.push(piece);
  }
  return out.map((p) => {
    const raw = text.slice(p.start, p.end);
    const lead = raw.length - raw.trimStart().length;
    const t = raw.trim();
    return { text: t, start: p.start + lead, end: p.start + lead + t.length };
  }).filter((p) => p.text);
}
