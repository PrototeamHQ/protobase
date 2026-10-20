import { describe, expect, it } from 'vitest'
import { boundaryOf, multipartParts } from './multipart'

const encode = async (form: FormData) => {
  const request = new Request('http://localhost/', { method: 'POST', body: form })
  // Read before the body: Bun's request loses its multipart Content-Type once the body is read.
  const boundary = boundaryOf(request.headers.get('content-type')!)!
  return { bytes: new Uint8Array(await request.arrayBuffer()), boundary }
}

describe('multipartParts', () => {
  it('keeps every part, a nameless file part too, as storage-js sends a Blob', async () => {
    const form = new FormData()
    form.append('cacheControl', '3600')
    form.append('metadata', '{"a":1}')
    form.append('', new Blob([new Uint8Array([1, 2, 13, 10, 3])], { type: 'image/png' }))
    const { bytes, boundary } = await encode(form)
    const parts = multipartParts(bytes, boundary)!
    expect(parts.map(({ name, type }) => [name, type])).toEqual([['cacheControl', undefined], ['metadata', undefined], ['', 'image/png']])
    expect(new TextDecoder().decode(parts[1]!.body)).toBe('{"a":1}')
    expect(parts[2]!.filename).toBeDefined()
    expect([...parts[2]!.body]).toEqual([1, 2, 13, 10, 3])
  })

  it('reads a quoted boundary, and gives undefined for a body that does not parse', () => {
    expect(boundaryOf('multipart/form-data; boundary="a b"')).toBe('a b')
    expect(boundaryOf('multipart/form-data; boundary=xyz; charset=utf-8')).toBe('xyz')
    expect(multipartParts(new TextEncoder().encode('--xyz\r\nContent-Disposition: form-data; name="a"\r\n\r\nno end'), 'xyz')).toBeUndefined()
    expect(multipartParts(new TextEncoder().encode('nothing'), 'xyz')).toBeUndefined()
  })
})
