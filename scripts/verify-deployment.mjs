import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pages = [
  join(projectRoot, 'index.html'),
  join(projectRoot, '404.html'),
];

try {
  await access(join(projectRoot, 'dist', 'index.html'));
  pages.push(
    join(projectRoot, 'dist', 'index.html'),
    join(projectRoot, 'dist', '404.html'),
  );
} catch {
  // The committed repository root is independently deployable without dist.
}

for (const pagePath of pages) {
  const html = await readFile(pagePath, 'utf8');
  if (html.includes('/src/main.tsx')) {
    throw new Error(`${pagePath} points to TypeScript source instead of a browser bundle.`);
  }
  if (/src=["']\/assets\//.test(html) || /href=["']\/assets\//.test(html)) {
    throw new Error(`${pagePath} contains a root absolute asset path.`);
  }
  if (!html.includes('./assets/')) {
    throw new Error(`${pagePath} does not reference relative deployment assets.`);
  }
  if (/<title>[^<]*[-–—][^<]*<\/title>/.test(html)) {
    throw new Error(`${pagePath} contains a dash character in the visible page title.`);
  }

  const references = [...html.matchAll(/(?:src|href)=["']\.\/(assets\/[^"']+)["']/g)];
  for (const reference of references) {
    await access(join(dirname(pagePath), reference[1]));
  }
}

console.log('GitHub Pages deployment structure passed.');
