import { cp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = join(projectRoot, 'dist');
const builtEntry = join(distRoot, 'app.html');
const builtAssets = join(distRoot, 'assets');
const rootAssets = join(projectRoot, 'assets');
const html = await readFile(builtEntry, 'utf8');

if (html.includes('/src/main.tsx')) {
  throw new Error('The production page still points to uncompiled source code.');
}

if (!html.includes('./assets/')) {
  throw new Error('The production page does not use relative GitHub Pages assets.');
}

await writeFile(join(distRoot, 'index.html'), html);
await writeFile(join(distRoot, '404.html'), html);
await writeFile(join(distRoot, '.nojekyll'), '');
await unlink(builtEntry);

await rm(rootAssets, { recursive: true, force: true });
await cp(builtAssets, rootAssets, { recursive: true });
await writeFile(join(projectRoot, 'index.html'), html);
await writeFile(join(projectRoot, '404.html'), html);
await writeFile(join(projectRoot, '.nojekyll'), '');

console.log('GitHub Pages files are ready at the repository root and in dist.');
