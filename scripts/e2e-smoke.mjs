import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const viteBin = fileURLToPath(
  new URL('../node_modules/vite/bin/vite.js', import.meta.url),
);
const preview = spawn(
  process.execPath,
  [viteBin, 'preview', '--host', '127.0.0.1', '--port', '4173'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);

let serverOutput = '';
preview.stdout.on('data', (chunk) => {
  serverOutput += String(chunk);
});
preview.stderr.on('data', (chunk) => {
  serverOutput += String(chunk);
});

async function waitForPreview() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:4173/');
      if (response.ok) {
        return;
      }
    } catch {
      // The preview process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Preview server did not start.\n${serverOutput}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
};

function createGitHubPagesServer() {
  return createServer(async (request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url ?? '/', 'http://127.0.0.1').pathname,
    );
    if (!pathname.startsWith('/demo/')) {
      response.writeHead(404).end('Not found');
      return;
    }

    const relativePath = pathname.slice('/demo/'.length) || 'index.html';
    if (relativePath.split('/').includes('..')) {
      response.writeHead(400).end('Invalid path');
      return;
    }

    try {
      const file = await readFile(join(projectRoot, relativePath));
      const contentType = contentTypes[extname(relativePath)] ?? 'application/octet-stream';
      response.writeHead(200, { 'content-type': contentType });
      response.end(file);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

async function closeServer(server) {
  if (!server) {
    return;
  }
  await new Promise((resolve) => server.close(resolve));
}

async function assertImagesLoaded(page) {
  await page.waitForFunction(() =>
    [...document.images].every((image) => image.complete),
  );
  const failedImages = await page.evaluate(() =>
    [...document.images]
      .filter((image) => image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src),
  );
  assert(failedImages.length === 0, `Images failed to load: ${failedImages.join(', ')}`);
}

async function assertNoVisibleDashes(page) {
  const pageCopy = await page.evaluate(() => ({
    title: document.title,
    text: document.body.innerText,
  }));
  assert(
    !/[-–—]/.test(`${pageCopy.title}\n${pageCopy.text}`),
    'Visible website text contains a dash character.',
  );
}

let browser;
let elementServer;
let pagesServer;

try {
  await waitForPreview();
  const elementBundle = await readFile(
    new URL('../dist-element/aura-vto-element.js', import.meta.url),
  );
  elementServer = createServer((request, response) => {
    if (request.url === '/aura-vto-element.js') {
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
      response.end(elementBundle);
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(
      '<!doctype html><html><head></head><body><script src="/aura-vto-element.js"></script></body></html>',
    );
  });
  await listen(elementServer, 4174);

  pagesServer = createGitHubPagesServer();
  await listen(pagesServer, 4175);

  browser = await chromium.launch({ headless: true });

  const deployedPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const deployedErrors = [];
  const failedResponses = [];
  deployedPage.on('pageerror', (error) => deployedErrors.push(error.message));
  deployedPage.on('console', (message) => {
    if (message.type() === 'error') {
      deployedErrors.push(message.text());
    }
  });
  deployedPage.on('response', (response) => {
    if (response.url().startsWith('http://127.0.0.1:4175/demo/') && response.status() >= 400) {
      failedResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await deployedPage.goto('http://127.0.0.1:4175/demo/', { waitUntil: 'networkidle' });
  await deployedPage.locator('article').first().waitFor();
  assert(
    (await deployedPage.locator('article').count()) === 8,
    'The repository root deployment must show all 8 products.',
  );
  assert(
    deployedPage.url().includes('/demo/#/category/all-products'),
    'The deployed app did not create a GitHub Pages safe route.',
  );
  await assertImagesLoaded(deployedPage);
  await assertNoVisibleDashes(deployedPage);
  assert(
    await deployedPage.evaluate(() =>
      [...document.images].every(
        (image) => new URL(image.currentSrc || image.src).pathname.startsWith('/demo/assets/'),
      ),
    ),
    'Product images do not resolve beneath the repository subpath.',
  );

  await Promise.all([
    deployedPage.waitForURL((url) => url.hash === '#/category/clothing'),
    deployedPage.getByRole('link', { name: 'CLOTHING' }).click(),
  ]);
  await deployedPage.waitForFunction(
    () => document.querySelectorAll('article').length === 5,
  );
  assert(
    (await deployedPage.locator('article').count()) === 5,
    'The Clothing category must show 5 products.',
  );
  await assertImagesLoaded(deployedPage);
  await assertNoVisibleDashes(deployedPage);

  for (const [category, expectedCount] of [
    ['tailoring', 2],
    ['accessories', 3],
    ['all-products', 8],
  ]) {
    await deployedPage.goto(`http://127.0.0.1:4175/demo/#/category/${category}`);
    await deployedPage.locator('article').first().waitFor();
    assert(
      (await deployedPage.locator('article').count()) === expectedCount,
      `${category} category rendered the wrong number of products.`,
    );
    await assertImagesLoaded(deployedPage);
    await assertNoVisibleDashes(deployedPage);
  }

  await deployedPage
    .getByRole('link', { name: 'Stone Open Collar Set', exact: true })
    .click();
  assert(
    deployedPage.url().includes('#/product/stone-open-collar-set'),
    'Product navigation did not stay inside the GitHub Pages route.',
  );
  await deployedPage.reload({ waitUntil: 'networkidle' });
  assert(
    (await deployedPage.getByRole('heading', { name: 'Stone Open Collar Set' }).count()) === 1,
    'Refreshing a product route did not restore the product page.',
  );
  await assertImagesLoaded(deployedPage);
  await assertNoVisibleDashes(deployedPage);
  assert(failedResponses.length === 0, `Deployment requests failed: ${failedResponses.join(', ')}`);
  assert(deployedErrors.length === 0, `Deployment browser errors: ${deployedErrors.join(', ')}`);
  await deployedPage.close();

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    window.__auraGetUserMediaCalls = 0;
    window.__auraStoppedTracks = 0;
    window.__auraCameraMode = 'success';
    HTMLMediaElement.prototype.play = async () => undefined;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          window.__auraGetUserMediaCalls += 1;
          if (window.__auraCameraMode === 'deny') {
            throw new DOMException('Denied by smoke test', 'NotAllowedError');
          }

          const stream = document.createElement('canvas').captureStream(1);
          stream.getTracks().forEach((track) => {
            const stop = track.stop.bind(track);
            track.stop = () => {
              window.__auraStoppedTracks += 1;
              stop();
            };
          });
          return stream;
        },
      },
    });
  });

  await page.goto('http://127.0.0.1:4173/#/category/all-products');
  assert((await page.locator('article').count()) === 8, 'All Products must show 8 cards.');

  const sandCard = page.locator('article').filter({ hasText: 'Sand Layering Blazer Set' });
  await sandCard.getByRole('button', { name: /Try Sand Layering Blazer Set live/i }).click();
  assert(
    (await page.getByRole('dialog').textContent())?.includes('Sand Layering Blazer Set'),
    'Category click did not open the clicked product.',
  );
  assert(
    (await page.evaluate(() => window.__auraGetUserMediaCalls)) === 0,
    'Camera started before explicit consent.',
  );
  await page.keyboard.press('Escape');

  await page.goto('http://127.0.0.1:4173/#/product/stone-open-collar-set');
  await page.getByRole('button', { name: 'Charcoal' }).click();
  await page.getByRole('button', { name: 'TRY IT LIVE' }).click();
  const dialogText = await page.getByRole('dialog').textContent();
  assert(dialogText?.includes('Charcoal'), 'Selected colour was not passed into AURA Live.');
  await assertNoVisibleDashes(page);
  await page.getByRole('button', { name: 'START CAMERA' }).click();
  await page.waitForTimeout(100);
  assert(
    (await page.evaluate(() => window.__auraGetUserMediaCalls)) === 1,
    'Camera was not requested exactly once after START CAMERA.',
  );
  await page.keyboard.press('Escape');
  assert((await page.getByRole('dialog').count()) === 0, 'ESC did not close AURA Live.');
  assert(
    (await page.evaluate(() => window.__auraStoppedTracks)) > 0,
    'Closing AURA Live did not stop all camera tracks.',
  );

  await page.evaluate(() => {
    window.__auraCameraMode = 'deny';
  });
  await page.getByRole('button', { name: 'TRY IT LIVE' }).click();
  await page.getByRole('button', { name: 'START CAMERA' }).click();
  await page.waitForTimeout(100);
  assert(
    (await page.getByRole('alert').textContent())?.includes('Camera access is off'),
    'Camera denied guidance was not shown.',
  );
  assert(
    await page.getByRole('button', { name: 'UPLOAD PHOTO FALLBACK' }).isVisible(),
    'Photo fallback disappeared after camera denial.',
  );
  await page.keyboard.press('Escape');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://127.0.0.1:4173/#/category/clothing');
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert(!hasOverflow, 'Mobile category page has horizontal overflow.');

  const elementPage = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  elementPage.on('pageerror', (error) => {
    console.error('Custom element page error:', error);
  });
  await elementPage.goto('http://127.0.0.1:4174/');
  await Promise.race([
    elementPage.evaluate(() => customElements.whenDefined('aura-virtual-try-on')),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Custom element registration timed out.')), 5000),
    ),
  ]);
  await elementPage.evaluate(() => {
    const element = document.createElement('aura-virtual-try-on');
    element.setAttribute(
      'product-json',
      JSON.stringify({
        productId: 'element-test',
        productName: 'Wix Element Test',
        garmentType: 'full-body',
        colour: 'Stone',
        size: 'M',
        garmentAsset:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/55n8WQAAAABJRU5ErkJggg==',
      }),
    );
    element.setAttribute('open', 'true');
    document.body.append(element);
  });
  assert(
    (await elementPage.getByRole('dialog').textContent())?.includes('Wix Element Test'),
    'The Wix custom element bundle did not open with its product payload.',
  );
  assert(
    (await elementPage.locator('#aura-vto-element-styles').count()) === 1,
    'The Wix custom element bundle did not inject its scoped CSS.',
  );
  await elementPage.getByRole('button', { name: 'Close AURA Live' }).click();
  await elementPage.close();

  console.log('AURA GitHub Pages and feature smoke tests passed.');
} finally {
  await browser?.close();
  await closeServer(elementServer);
  await closeServer(pagesServer);
  if (preview.exitCode === null) {
    preview.kill('SIGTERM');
    await Promise.race([
      once(preview, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
}
