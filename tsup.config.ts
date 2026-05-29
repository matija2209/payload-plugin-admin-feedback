import { defineConfig } from 'tsup';

const external = ['payload', 'react', 'react-dom', 'next', 'next/navigation'];

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    outDir: 'dist',
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    splitting: false,
    treeshake: true,
    external,
  },
  {
    entry: { 'client/index': 'src/client/index.ts' },
    outDir: 'dist',
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    treeshake: true,
    external,
  },
]);
