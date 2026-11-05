import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/plugin/index.ts'],
  unbundle: true,
  fixedExtension: false,
  dts: true,
})
