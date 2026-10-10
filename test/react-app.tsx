// The React test page's app (test/react.html). Built by `npm run build:test-react` into test/react-app.js, with
// React bundled in. It uses dist/react.js exactly as an app would.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useYomiage, useYomiageEngine, type YomiageState, type YomiageEngine } from "../dist/react.js";

const FILES = new URL("./files/", location.href).href;
type Hooks = { a?: YomiageState; b?: YomiageState; engine?: YomiageEngine; showA?: (show: boolean) => void };
const w = window as unknown as { hooks: Hooks };
w.hooks = {};

function ReadAloud({ name, text, preset }: { name: "a" | "b"; text: string; preset: "soft" | "deep" }) {
  const y = useYomiage({ filesUrl: FILES, preset, speed: 1.2 });
  useEffect(() => { w.hooks[name] = y; });
  useEffect(() => () => { delete w.hooks[name]; }, [name]);
  let body;
  switch (y.status) {
    case "not-loaded": body = <button onClick={y.load}>{y.cached ? "Turn on voice" : `Download voice (${y.downloadMB ?? "…"} MB)`}</button>; break;
    case "loading": body = <progress value={y.progress.fraction} />; break;
    case "unavailable": body = <span>({y.reason})</span>; break;
    case "error": body = <span>{y.error.message} <button onClick={y.retry}>Retry</button></span>; break;
    case "ready": body = <>
      <button onClick={() => (y.speaking ? y.stop() : void y.speak(text))}>{y.speaking ? "Stop" : "Read aloud"}</button>{" "}
      {y.sentence ? <>{text.slice(0, y.sentence.start)}<mark>{text.slice(y.sentence.start, y.sentence.end)}</mark>{text.slice(y.sentence.end)}</> : text}
    </>;
  }
  return <p><b>{name}</b> ({preset}) <small>[{y.status}]</small> {body}</p>;
}

function EngineRow() {
  const e = useYomiageEngine({ filesUrl: FILES });
  useEffect(() => { w.hooks.engine = e; });
  return <div className="row">
    Voice: {e.cached == null ? "…" : e.cached ? "on this device" : `${e.downloadMB} MB to download`}, <b>{e.status}</b>
    {e.progress && <progress value={e.progress.fraction} />}
    {e.status === "not-loaded" && <button onClick={e.load}>{e.cached ? "Load" : "Download"}</button>}
    {e.status === "ready" && <button onClick={e.unload}>Free memory</button>}
    {e.cached && <button onClick={e.clearCache}>Delete from device</button>}
    {e.error && <span> {e.error.message}</span>}
  </div>;
}

function App() {
  const [showA, setShowA] = useState(true);
  w.hooks.showA = setShowA;
  return <>
    <EngineRow />
    {showA && <ReadAloud name="a" preset="soft" text="こんにちは。今日はいい天気ですね。散歩に行きましょう。" />}
    <ReadAloud name="b" preset="deep" text="はい。" />
  </>;
}

createRoot(document.getElementById("app")!).render(<App />);
