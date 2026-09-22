# Deploy the corrected AURA website

The earlier blank page happened because GitHub Pages published `index.html` from the source project. That file tried to load `/src/main.tsx`, but browsers cannot run the uncompiled React and TypeScript project directly. It also requested assets from the domain root instead of the `/demo/` repository path.

This corrected project includes compiled website files at the repository root and therefore supports the GitHub Pages configuration already shown in your screenshots.

## Replace the current repository files

1. Extract `AURA_Virtual_Try_On_GitHub.zip` on your computer.
2. Open the `auraiovn/demo` repository on GitHub.
3. Remove the old project files from the `main` branch so outdated hashed scripts cannot remain.
4. Upload the contents inside the extracted folder. Do not upload the ZIP file itself and do not place the files inside another outer folder.
5. Confirm these items are at the top level of the repository:
   1. `index.html`
   2. `404.html`
   3. `assets`
   4. `app.html`
   5. `src`
   6. `package.json`
6. Open **Settings**, then **Pages**.
7. Under **Build and deployment**, choose **Deploy from a branch**.
8. Select branch **main**, folder **/ (root)**, then save.
9. After the deployment finishes, open `https://auraiovn.github.io/demo/` in a private browser window or perform a hard refresh.

The first visible address becomes `https://auraiovn.github.io/demo/#/category/all-products`. This hash route is intentional and prevents blank pages when a visitor refreshes a Category or Product page.

## Automated deployment option

The repository also includes `.github/workflows/deploy-pages.yml`. If you choose **GitHub Actions** as the Pages source, each push to `main` installs the dependencies, builds the app, validates the deployment files, and publishes `dist/` automatically.

Use only one Pages method at a time. Direct branch deployment is the simplest option when files are uploaded through the GitHub website.
