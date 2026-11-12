import jbig2Wasm from 'pdfjs-dist/wasm/jbig2.wasm?url'
import openjpegWasm from 'pdfjs-dist/wasm/openjpeg.wasm?url'
import dingbatsFont from 'pdfjs-dist/standard_fonts/FoxitDingbats.pfb?url'
import symbolFont from 'pdfjs-dist/standard_fonts/FoxitSymbol.pfb?url'

// The files pdf.js asks for by name, each emitted by the app's Vite build at an address of its own: the decoders of
// JPEG 2000 and JBIG2 images, which scans use, and the two standard fonts the browser has no stand-in for.
const assets: Record<string, Record<string, string>> = {
  wasmUrl: { 'openjpeg.wasm': openjpegWasm, 'jbig2.wasm': jbig2Wasm },
  standardFontDataUrl: { 'FoxitSymbol.pfb': symbolFont, 'FoxitDingbats.pfb': dingbatsFont },
}

/**
 * pdf.js's `BinaryDataFactory`: hands its worker the files it asks for by kind and name, from the addresses the build
 * gave them, since a directory URL of fixed names does not survive a build that names files by their content. Other
 * files, such as the CMaps of CJK fonts a PDF does not embed, are not brought, and pdf.js draws without them.
 */
export class PdfAssets {
  async fetch({ kind, filename }: { kind: string; filename: string }) {
    const url = assets[kind]?.[filename]
    if (!url) throw new Error(`The PDF viewer does not bring pdf.js's ${kind} file ${filename}`)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`pdf.js's file ${filename} could not be read: its link answered ${response.status}`)
    return new Uint8Array(await response.arrayBuffer())
  }
}
