/**
 * Removes side-effect CSS imports (`import './x.css';`) from the emitted type
 * declarations. Styles ship separately as dist/radchat.css, and the .css files
 * do not exist next to the .d.ts files.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../dist/types/', import.meta.url).pathname;
const CSS_IMPORT = /^import\s+['"][^'"]+\.css['"];?\s*\n/gm;

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name.endsWith('.d.ts')) {
      const source = await readFile(path, 'utf8');
      const stripped = source.replace(CSS_IMPORT, '');
      if (stripped !== source) await writeFile(path, stripped);
    }
  }
}

await walk(root);
