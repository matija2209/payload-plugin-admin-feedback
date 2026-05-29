import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const directive = "'use client';";

for (const file of ['dist/client/index.js', 'dist/client/index.cjs']) {
  const path = join(root, file);
  const source = readFileSync(path, 'utf8');

  if (source.startsWith(directive)) {
    continue;
  }

  writeFileSync(path, `${directive}\n${source}`);
}
