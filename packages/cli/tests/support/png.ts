/** The start of a PNG `size` pixels square, its signature and IHDR chunk: enough for what reads its size. */
export const testPng = (size: number, height = size) => {
  const png = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0)
  png.writeUInt32BE(13, 8)
  png.write('IHDR', 12, 'latin1')
  png.writeUInt32BE(size, 16)
  png.writeUInt32BE(height, 20)
  return png
}
