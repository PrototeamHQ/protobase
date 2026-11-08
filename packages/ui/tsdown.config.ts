import { defineConfig } from 'tsdown'

// A Web Worker is started from its module's URL, `new URL('./parse-worker.ts', import.meta.url)`, which Vite bundles
// from the sources. Each worker is an entry like every module here, and its URL is rewritten to the .js file that entry
// becomes, for the Vite that builds the app from this package.
const workerUrls = {
  name: 'worker-urls',
  renderChunk: (code: string) => ({ code: code.replace(/new URL\((["'])(\.{1,2}\/[^"']+)\.ts\1, import\.meta\.url\)/g, 'new URL($1$2.js$1, import.meta.url)') }),
}

// Every module is an entry, so @protobase/ui/unstable/<path> finds each one, not only those the stable entry reaches;
// app/main.tsx among them is the admin app's entry, loaded by index.html. Tests, stories and their fakes are left out.
// CSS imports stay imports and the CSS files are copied next to the modules importing them, for the Vite that builds the
// app (or a project's own UI) to process.
export default defineConfig({
  entry: ['src/**/*.{ts,tsx}', '!src/**/*.{test,stories}.{ts,tsx}', '!src/**/*.d.ts', '!src/app/testing/**'],
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
    { from: 'src/app/field-types/workflow/workflow-canvas.css', to: 'dist/app/field-types/workflow' },
    { from: 'src/app/index.html', to: 'dist/app' },
    { from: 'src/app/favicon.svg', to: 'dist/app' },
  ],
})
