import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/calls/index.ts'],
  unbundle: true,
  fixedExtension: false,
  dts: true,
})
