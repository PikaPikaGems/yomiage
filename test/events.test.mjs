import assert from "node:assert/strict";
import { test } from "node:test";
import { createVoice } from "../dist/yomiage.js";

test("voice event subscriptions keep the engine handle bound, including detached on()", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", { configurable: true, value: new URL("https://example.invalid/") });
  try {
    const voice = createVoice({ filesUrl: "https://example.invalid/files/" });
    const on = voice.on;
    for (const event of ["status", "progress", "log"]) {
      const off = on(event, () => {});
      assert.equal(typeof off, "function");
      off();
    }
    assert.equal(voice.status, "not-loaded");
    voice.dispose();
  } finally {
    if (previous) Object.defineProperty(globalThis, "location", previous);
    else delete globalThis.location;
  }
});
