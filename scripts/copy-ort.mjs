// Copies the ONNX Runtime WebAssembly files the on-device reader needs into public/ort,
// so they're served from this site instead of a CDN. Runs before dev and build.
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const dist = join(process.cwd(), "node_modules", "onnxruntime-web", "dist");
const out = join(process.cwd(), "public", "ort");
mkdirSync(out, { recursive: true });
// The default onnxruntime-web build (WebGPU with WebAssembly fallback) loads only these two.
for (const f of ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"]) {
  copyFileSync(join(dist, f), join(out, f));
}
console.log("copied ONNX Runtime wasm to public/ort");
