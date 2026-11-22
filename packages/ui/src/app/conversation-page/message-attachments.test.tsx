import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MessageAttachments } from './message-attachments'

const image = { key: 1, name: 'shot.png', type: 'image/png', size: 3_000, url: '/files/shot.png?sig=x', width: 640, height: 480 }
const pdf = { key: 2, name: 'plan.pdf', type: 'application/pdf', size: 48_000, url: '/files/plan.pdf?sig=y', width: undefined, height: undefined }

describe('a message’s files', () => {
  it('shows an image as a preview at most 240 px high inside a link that opens it', () => {
    const html = renderToStaticMarkup(<MessageAttachments attachments={[image]} />)
    expect(html).toMatch(/<a href="\/files\/shot.png\?sig=x" target="_blank"[^>]*><img src="\/files\/shot.png\?sig=x" alt="shot.png" width="640" height="480" style="max-height:240px"/)
  })

  it('shows another file as a download link with its name and size', () => {
    const html = renderToStaticMarkup(<MessageAttachments attachments={[pdf]} />)
    expect(html).toMatch(/<a href="\/files\/plan.pdf\?sig=y" download="plan.pdf"/)
    expect(html).toContain('plan.pdf')
    expect(html).toContain('48 kB')
    expect(html).not.toContain('<img')
  })

  it('shows a file missing from storage by name, with no link', () => {
    const html = renderToStaticMarkup(<MessageAttachments attachments={[{ ...image, url: undefined }]} />)
    expect(html).not.toContain('<a')
    expect(html).toContain('shot.png')
    expect(html).toContain('This file is missing')
  })
})
