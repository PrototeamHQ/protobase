import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/internal.ts'],
  unbundle: true,
  fixedExtension: false,
  dts: true,
})
