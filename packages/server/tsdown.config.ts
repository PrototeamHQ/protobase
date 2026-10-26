import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/config-exports.ts', 'src/email.ts', 'src/vapid.ts'],
  unbundle: true,
  fixedExtension: false,
  dts: true,
})
