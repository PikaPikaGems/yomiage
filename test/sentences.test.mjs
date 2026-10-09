import test from "node:test";
import assert from "node:assert/strict";
import { splitSentences, splitForSpeech, isOtherLanguage } from "../.cache/ts/sentences.js";

const texts = (pieces) => pieces.map((p) => p.text);
const positionsMatch = (text, pieces) => pieces.every((p) => text.slice(p.start, p.end) === p.text);

test("sentences end at 。！？ and newlines; positions point into the text", () => {
  const text = "こんにちは。 今日はいい天気ですね！\n明日は？";
  const s = splitSentences(text);
  assert.deepEqual(texts(s), ["こんにちは。", "今日はいい天気ですね！", "明日は？"]);
  assert.ok(positionsMatch(text, s));
});

test("enders inside 「」 don't split; closing quotes stay with their sentence", () => {
  assert.deepEqual(texts(splitSentences("「行こう！」と彼は言った。そうだね。")), ["「行こう！」と彼は言った。", "そうだね。"]);
  assert.deepEqual(texts(splitSentences("彼は「はい。」")), ["彼は「はい。」"]);
});

test("ASCII periods split only before a space or the end, so 3.14 stays whole", () => {
  assert.deepEqual(texts(splitSentences("Pi is 3.14 today. Yes.")), ["Pi is 3.14 today.", "Yes."]);
});

test("pieces with no letters or digits are dropped", () => {
  assert.deepEqual(texts(splitSentences("……。\n\n  \nはい。")), ["はい。"]);
});

test("long sentences are cut after 、 into pieces of at most MAX_CHARS", () => {
  const text = "私は毎朝、近くの公園を散歩して、鳥の声を聞きながら、ゆっくりと深呼吸をして、一日の計画を立てることにしています。";
  const p = splitForSpeech(text, 20);
  assert.ok(p.length > 1);
  assert.ok(p.every((x) => x.text.length <= 20), texts(p).join(" | "));
  assert.equal(texts(p).join(""), text);
  assert.ok(positionsMatch(text, p));
});

test("a long sentence without commas stays whole", () => {
  const text = "あ".repeat(60) + "。";
  assert.deepEqual(texts(splitForSpeech(text, 40)), [text]);
});

test("other-language detection: no Japanese at all and some letters", () => {
  assert.equal(isOtherLanguage("Let's do our best!"), true);
  assert.equal(isOtherLanguage("今日はmeetingがあります。"), false);
  assert.equal(isOtherLanguage("123!"), false);
  assert.equal(isOtherLanguage("ｶﾀｶﾅ"), false);
});
