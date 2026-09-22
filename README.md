# AURA Virtual Try On

GitHub ready React + TypeScript implementation of the AURA Product Page, Category Pages, and one reusable client side Virtual Try On engine. The repository intentionally contains no unrelated website pages.

The repository root is also a complete prebuilt website. This is intentional: uploading the extracted files directly to a GitHub repository now works with GitHub Pages set to `main` and `/ (root)`. The source application lives in `app.html` and `src/`, while `index.html`, `404.html`, and `assets/` are generated browser ready files.

## Architecture

- `src/pages/CategoryPage.tsx` renders the same product-card integration for **ALL PRODUCTS**, **CLOTHING**, **TAILORING**, and **ACCESSORIES**.
- `src/pages/ProductPage.tsx` passes the current product, selected colour, selected size, and colour-specific garment asset into the shared engine.
- `src/components/VirtualTryOn/` owns the modal, camera lifecycle, pose detection, body geometry, smoothing, fit controls, photo fallback, focus management, and cleanup.
- `src/wix/aura-vto-element.tsx` exposes the same modal as `<aura-virtual-try-on>` for an existing Wix page.
- `integrations/wix/` contains the two minimal Wix page-code connections. Existing page layout and Wix product behavior stay in place.

The feature never starts the camera automatically. Closing the modal stops every `MediaStreamTrack`, cancels detection/render loops, clears temporary state, and disposes the pose model.

## Selected libraries

- **React + TypeScript**: reusable state and strict product/variant contracts.
- **MediaPipe Tasks Vision / Pose Landmarker**: real browser pose landmarks for shoulders, hips, knees, and ankles. Detection is limited to approximately 15 FPS while canvas rendering remains smooth.
- **Vite**: fast local development, a repository subpath safe GitHub Pages build, and a separate single file custom element build for Wix.

MediaPipe is loaded only after AURA Live opens. Camera and uploaded-photo processing stay in the browser. This prototype previews silhouette, colour, and general proportion; it is not cloth physics, tailoring measurement, size prediction, or guaranteed fit.

## Garment asset format

Each eligible variant needs a front-facing transparent PNG or WebP:

- transparent background;
- garment centred and upright;
- no model or mannequin;
- consistent shoulder-to-ankle crop between colour variants;
- at least 1000 px tall for production use;
- HTTPS URL when used on Wix.

Example:

```ts
{
  colour: 'Charcoal',
  swatch: '#383838',
  garmentAsset: 'https://cdn.example.com/vto/stone-open-collar-charcoal.png'
}
```

The included PNGs are prototype assets extracted from the supplied visual references. Replace them with clean product-team exports before production launch.

## Run locally

```bash
npm install
npm run dev
```

Open the printed localhost URL. Camera access works on `localhost`; deployed builds must use HTTPS.

Useful checks:

```bash
npm run typecheck
npm test
npm run build:all
npm run test:deployment
npx playwright install chromium
npm run test:e2e
npm run preview
```

## Routes to test

- `/#/category/all-products`
- `/#/category/clothing`
- `/#/category/tailoring`
- `/#/category/accessories`
- `/#/product/stone-open-collar-set`

On the Stone product page, change **Stone / Cream / Charcoal** before pressing **TRY IT LIVE**. The modal receives the matching asset.

## Build for GitHub Pages

```bash
npm run build
```

This command creates two equivalent deployments:

1. `dist/` for the included GitHub Actions deployment workflow.
2. `index.html`, `404.html`, and `assets/` at the repository root for direct branch deployment.

The application uses relative assets and hash based routing, so a repository subpath such as `https://auraiovn.github.io/demo/` works without editing a base URL. See `DEPLOY_TO_GITHUB.md` for the exact replacement steps.

## Build the Wix custom element

```bash
npm run build:element
```

Host these generated files on HTTPS:

- `dist-element/aura-vto-element.js` (the scoped modal CSS is injected into this bundle)
- the garment assets referenced by absolute HTTPS URLs

Then follow `WIX-INTEGRATION.md`. The custom element accepts:

- `product-json`: serialized `VirtualTryOnProduct`
- `open="true"`: opens the modal

It emits `aura-vto-close` after cleanup and `aura-vto-error` for an invalid product payload.

## Debug mode

`src/components/VirtualTryOn/constants.ts` contains:

```ts
export const VTO_DEBUG = false;
```

Setting it to `true` shows landmark anchors, garment bounds, confidence, and detection FPS. Keep it `false` in production.

## Production model hosting

The demo defaults to the official MediaPipe WASM and pose-model URLs. For a controlled production rollout, download those exact assets, serve them from AURA's HTTPS origin/CDN, and set:

```bash
VITE_MEDIAPIPE_WASM_ROOT=https://cdn.example.com/mediapipe/wasm
VITE_POSE_MODEL_URL=https://cdn.example.com/mediapipe/pose_landmarker_lite.task
```
