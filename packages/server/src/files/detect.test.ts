import { describe, expect, it } from 'vitest'
import { decideType } from './detect'
import { accepts } from './media-types'
import { binary, csv, exe, html, jpeg, pdf, png, svg, zip } from './testing/samples'

const decide = (head: Uint8Array, name: string | undefined, declared: string | undefined, accept: string[]) =>
  decideType({ head, complete: true, accept, ...(name !== undefined && { name }), ...(declared !== undefined && { declared }) })

const verdict = async (...args: Parameters<typeof decide>) => {
  const decision = await decide(...args)
  return { type: decision.type, ok: accepts(args[3], decision.type) }
}

describe('deciding an upload type', () => {
  it('trust recognized content over the name and the header, and say what was corrected', async () => {
    expect(await decide(png, 'photo', undefined, ['image/*'])).toEqual({ type: 'image/png', extension: 'png' })
    expect(await decide(jpeg, 'photo.png', 'image/png', ['image/*'])).toEqual({ type: 'image/jpeg', extension: 'jpg', corrected: { from: 'image/png', to: 'image/jpeg' } })
    expect(await verdict(jpeg, 'photo.png', 'image/png', ['image/png'])).toEqual({ type: 'image/jpeg', ok: false })
    expect(await verdict(pdf, 'invoice.pdf', 'application/pdf', ['application/pdf'])).toEqual({ type: 'application/pdf', ok: true })
    expect(await verdict(exe, 'invoice.pdf', 'application/pdf', ['application/pdf'])).toEqual({ type: 'application/x-msdownload', ok: false })
    expect(await verdict(zip, 'archive.zip', 'application/zip', ['application/pdf'])).toEqual({ type: 'application/zip', ok: false })
  })

  it('never take markup as an image, whatever it is called', async () => {
    expect(await verdict(html, 'page.png', 'image/png', ['image/*'])).toEqual({ type: 'text/plain', ok: false })
    expect(await verdict(svg, 'logo.svg', 'image/svg+xml', ['image/*'])).toEqual({ type: 'text/plain', ok: false })
  })

  it('give text the type of its extension, or of the header when there is none', async () => {
    expect(await verdict(csv, 'prices.csv', 'text/csv', ['text/csv'])).toEqual({ type: 'text/csv', ok: true })
    expect(await decide(html, 'page.csv', 'text/html', [])).toMatchObject({ type: 'text/csv', corrected: { from: 'text/html', to: 'text/csv' } })
    expect((await decide(csv, 'prices', 'text/csv', [])).type).toBe('text/csv')
    expect((await decide(csv, 'prices.dat', 'text/csv', [])).type).toBe('text/plain')
  })

  it('take an unknown binary by its extension only when the field lists that type exactly', async () => {
    expect((await decide(binary, 'model.sqlite', undefined, ['application/x-sqlite3'])).type).toBe('application/x-sqlite3')
    expect((await decide(binary, 'model.sqlite', 'application/zip', ['application/x-sqlite3'])).type).toBe('application/octet-stream')
    expect((await decide(binary, 'model.sqlite', undefined, ['application/*'])).type).toBe('application/octet-stream')
    expect((await decide(binary, 'blob', 'application/octet-stream', [])).type).toBe('application/octet-stream')
  })

  it('read a head cut inside a character as text', async () => {
    const head = new TextEncoder().encode('café').slice(0, 4)
    expect((await decideType({ head, complete: false, name: 'a.txt', accept: [] })).type).toBe('text/plain')
    expect((await decideType({ head, complete: true, name: 'a.txt', accept: [] })).type).toBe('application/octet-stream')
  })
})
