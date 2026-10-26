import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/internal.ts', 'src/png-icons.ts'],
  unbundle: true,
  fixedExtension: false,
  dts: true,
})
