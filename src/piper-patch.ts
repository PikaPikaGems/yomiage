// Workaround for piper-plus 0.7.0 bugs: when a model declares `speaker_embedding`
// and none is supplied, index.js feeds a hardcoded [1,192] zero vector and a
// rank-1 `speaker_embedding_mask` ([1], mask = 0). The tsukuyomi model declares
// a 256-dim embedding and a rank-2 mask, so ORT rejects both. Rebuild the
// placeholders from the shapes the model actually declares.
import type * as Ort from "onnxruntime-web/wasm";

export function patchSpeakerEmbeddingDim(p: { _session: Ort.InferenceSession | null }, ort: Pick<typeof Ort, "Tensor">, log: (message: string) => void) {
  const session = p._session;
  const meta = session?.inputMetadata as readonly Ort.InferenceSession.ValueMetadata[] | Record<string, Ort.InferenceSession.ValueMetadata> | undefined;
  const shapeOf = (name: string) => {
    const value = Array.isArray(meta) ? meta.find((m) => m.name === name) : (meta as Record<string, Ort.InferenceSession.ValueMetadata> | undefined)?.[name];
    return value && "shape" in value ? value.shape : undefined;
  };
  const embShape = shapeOf("speaker_embedding");
  const maskShape = shapeOf("speaker_embedding_mask");
  const dim = embShape?.[1];
  if (!session || typeof dim !== "number" || dim <= 0) return;
  const run = session.run.bind(session) as (feeds: Ort.InferenceSession.FeedsType, ...rest: [fetchesOrOptions?: Ort.InferenceSession.FetchesType | Ort.InferenceSession.RunOptions, options?: Ort.InferenceSession.RunOptions]) => Promise<Ort.InferenceSession.ReturnType>;
  session.run = (feeds: Ort.InferenceSession.FeedsType, ...rest: [fetchesOrOptions?: Ort.InferenceSession.FetchesType | Ort.InferenceSession.RunOptions, options?: Ort.InferenceSession.RunOptions]) => {
    const emb = feeds.speaker_embedding;
    if (emb && emb.dims[1] !== dim) {
      feeds = { ...feeds, speaker_embedding: new ort.Tensor("float32", new Float32Array(dim), [1, dim]) };
    }
    const mask = feeds.speaker_embedding_mask;
    if (mask && maskShape && mask.dims.length !== maskShape.length) {
      const dims = maskShape.map(() => 1);
      feeds = { ...feeds, speaker_embedding_mask: new ort.Tensor("int64", mask.data, dims) };
    }
    return run(feeds, ...rest);
  };
  log(`Patched speaker_embedding placeholders (dim ${dim}, mask rank ${maskShape?.length ?? "n/a"}).`);
}
