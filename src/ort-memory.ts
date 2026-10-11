// ONNX Runtime's wasm (ort-wasm-simd-threaded) asks for a shared memory that may grow to 4 GB:
// new WebAssembly.Memory({ initial: 256, maximum: 65536, shared: true }). A shared memory can't move when it grows,
// so Safari reserves its whole maximum up front, and on iPhones that often fails at once with
// "RangeError: Out of memory" before anything is loaded. The voice needs about 200 MB of it, so ask for 1 GB instead
// (512 MB if even that is refused). A smaller maximum is allowed: the module only says how much it may use.
// Imported before onnxruntime-web, so it is in place before ONNX Runtime starts.
const ORT_MAX_PAGES = 65536;
const CAPS = [16384, 8192]; // 64 KB pages: 1 GB, 512 MB

const NativeMemory = WebAssembly.Memory;

function Memory(descriptor: WebAssembly.MemoryDescriptor & { shared?: boolean }) {
  if (!descriptor?.shared || descriptor.maximum !== ORT_MAX_PAGES) return new NativeMemory(descriptor);
  let error: unknown;
  for (const maximum of CAPS) {
    try {
      return new NativeMemory({ ...descriptor, maximum: Math.max(maximum, descriptor.initial) });
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
      error = e;
    }
  }
  throw error;
}
Memory.prototype = NativeMemory.prototype;
WebAssembly.Memory = Memory as unknown as typeof WebAssembly.Memory;
