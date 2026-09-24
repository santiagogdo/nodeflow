import { copyFile } from 'node:fs/promises';

// CommonJS consumers need a CommonJS declaration entry point under NodeNext resolution.
await copyFile(
  new URL('../dist/nodeflow.d.ts', import.meta.url),
  new URL('../dist/nodeflow.d.cts', import.meta.url),
);
