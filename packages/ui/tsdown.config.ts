import { defineConfig } from 'tsdown'

// A Web Worker is started from its module's URL, `new URL('./parse-worker.ts', import.meta.url)`, which Vite bundles
// from the sources. Each worker is an entry of its own here, and its URL is rewritten to the .js file that entry becomes,
// for the Vite that builds the app from this package.
const workers = ['src/app/import/parse-worker.ts']
const workerUrls = {
  name: 'worker-urls',
  renderChunk: (code: string) => ({ code: code.replace(/new URL\((["'])(\.{1,2}\/[^"']+)\.ts\1, import\.meta\.url\)/g, 'new URL($1$2.js$1, import.meta.url)') }),
}

// app/main.tsx is the admin app's entry, loaded by index.html. CSS imports stay imports and the CSS files are copied
// next to the modules importing them, for the Vite that builds the app (or a project's own UI) to process.
export default defineConfig({
  entry: ['src/index.ts', 'src/app/main.tsx', ...workers],
  plugins: [workerUrls],
  unbundle: true,
  fixedExtension: false,
  platform: 'neutral',
  dts: true,
  deps: { neverBundle: [/\.css$/, 'virtual:protobase-project-ui'] },
  copy: [
    { from: 'src/styles.css', to: 'dist' },
    { from: 'src/theme.css', to: 'dist' },
    { from: 'src/tokens.css', to: 'dist' },
    { from: 'src/filter-panel/range-slider.css', to: 'dist/filter-panel' },
    { from: 'src/app/index.html', to: 'dist/app' },
    { from: 'src/app/favicon.svg', to: 'dist/app' },
  ],
})
