import { defineConfig } from 'tsdown'

// app/main.tsx is the admin app's entry, loaded by index.html. CSS imports stay imports and the CSS files are copied
// next to the modules importing them, for the Vite that builds the app (or a project's own UI) to process.
export default defineConfig({
  entry: ['src/index.ts', 'src/app/main.tsx'],
  unbundle: true,
  fixedExtension: false,
  platform: 'neutral',
  dts: true,
  deps: { neverBundle: [/\.css$/, 'virtual:protobase-project-ui'] },
  copy: [
    { from: 'src/styles.css', to: 'dist' },
    { from: 'src/filter-panel/range-slider.css', to: 'dist/filter-panel' },
    { from: 'src/app/index.html', to: 'dist/app' },
  ],
})
