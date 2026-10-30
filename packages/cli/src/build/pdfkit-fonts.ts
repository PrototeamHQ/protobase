import type { Plugin } from 'vite'

const nodeBuild = /[\\/]pdfkit[\\/]js[\\/]pdfkit\.node\.mjs$/
const fontLoad = /\b[\w$]+\('#standard-fonts\/(\w+)'\)/g

/**
 * Bundles pdfkit's standard fonts, which React PDF's renderer writes text in. pdfkit's Node build loads each with a
 * `require` of its own subpath import, `#standard-fonts/Helvetica`, made at run time, which a bundle cannot resolve
 * from its own folder; this turns each into an import of the font's module beside it.
 */
export const pdfkitFonts = (): Plugin => ({
  name: 'protobase-pdfkit-fonts',
  transform(code, id) {
    if (!nodeBuild.test(id)) return
    const fonts = new Set([...code.matchAll(fontLoad)].map(([, font]) => font!))
    if (fonts.size === 0) this.error('pdfkit no longer loads its standard fonts as `require("#standard-fonts/<Font>")`; update pdfkitFonts')
    const imports = [...fonts].map((font) => `import __pdfkitFont${font} from './standard-fonts/${font}.mjs'\n`).join('')
    return { code: imports + code.replace(fontLoad, (_, font: string) => `__pdfkitFont${font}`), map: null }
  },
})
