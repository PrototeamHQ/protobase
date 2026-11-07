import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/gmail/index.ts'],
  unbundle: true,
  fixedExtension: false,
  dts: true,
})
