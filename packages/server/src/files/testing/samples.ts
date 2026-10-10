// Small files of known types, built by hand, for tests of detection and uploads.

const bytes = (...parts: Array<string | number[]>) => {
  const all = parts.flatMap((part) => (typeof part === 'string' ? [...new TextEncoder().encode(part)] : part))
  return new Uint8Array(all)
}

/** A 1×1 PNG. */
export const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0))

/** A JPEG header: start of image, a JFIF segment and a 6000×4000 frame. */
export const jpeg = bytes(
  [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 'JFIF', [0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00],
  [0xff, 0xc0, 0x00, 0x11, 0x08, 0x0f, 0xa0, 0x17, 0x70, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01],
  [0xff, 0xd9],
)

export const pdf = bytes('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n')

/** A DOS header pointing at a PE header: a Windows executable. */
export const exe = (() => {
  const file = new Uint8Array(256)
  file.set(bytes('MZ'), 0)
  file.set([0x80, 0, 0, 0], 0x3c)
  file.set(bytes('PE', [0, 0, 0x4c, 0x01]), 0x80)
  return file
})()

export const zip = bytes('PK', [0x03, 0x04, 0x14, 0, 0, 0, 0, 0], new Array(20).fill(0), 'a.txt', 'hello')

export const html = bytes('<!doctype html><script>alert(1)</script>')

export const svg = bytes('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

export const csv = bytes('sku,price\nA-1,10\n')

export const binary = bytes([0x00, 0x01, 0x02, 0xfe, 0xff, 0x10, 0x20])
