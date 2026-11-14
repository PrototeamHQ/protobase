import { describe, expect, it } from 'vitest'
import type { ViewedFile } from './file-viewer'
import { externalUrl, rewriteCssUrls, rewriteSrcset, siblingReference } from './sibling-references'

const file = (name: string): ViewedFile => ({ uri: `private://${name}`, name, type: 'image/png', url: `/files/${name}` })
const siblings = [file('a.png'), file('x.png'), file('clip.mp4'), file('other.html'), file('secret.png'), file('my chart.png')]
const resolve = (reference: string) => siblingReference(siblings, reference) && `data:${reference}`

describe('sibling references', () => {
  it("name the record's files by a relative path", () => {
    expect(siblingReference(siblings, 'a.png')).toBe(siblings[0])
    expect(siblingReference(siblings, './sub/x.png')).toBe(siblings[1])
    expect(siblingReference(siblings, ' clip.mp4 ')).toBe(siblings[2])
    expect(siblingReference(siblings, 'other.html#top')).toBe(siblings[3])
    expect(siblingReference(siblings, 'shots/my%20chart.png')).toBe(siblings[5])
    expect(siblingReference(siblings, 'my%2.png')).toBeUndefined()
  })

  it('name nothing for an unknown name, a climb out, a path from the root or another host', () => {
    expect(siblingReference(siblings, 'b.png')).toBeUndefined()
    expect(siblingReference(siblings, '../other_record/secret.png')).toBeUndefined()
    expect(siblingReference(siblings, 'sub/../secret.png')).toBeUndefined()
    expect(siblingReference(siblings, '%2E%2E/secret.png')).toBeUndefined()
    expect(siblingReference(siblings, '/abs/secret.png')).toBeUndefined()
    expect(siblingReference(siblings, '//evil.test/secret.png')).toBeUndefined()
    expect(siblingReference(siblings, 'https://evil.test/secret.png')).toBeUndefined()
  })

  it('rewrite each srcset candidate on its own, leaving the others as written', () => {
    expect(rewriteSrcset('a.png 1x, //evil.test/b.png 2x', resolve)).toBe('data:a.png 1x, //evil.test/b.png 2x')
    expect(rewriteSrcset('missing.png', resolve)).toBe('missing.png')
  })

  it('rewrite CSS url() of siblings only', () => {
    expect(rewriteCssUrls(`background: url('a.png'), url(https://evil.test/p.jpg), url( x.png )`, resolve)).toBe(
      `background: url("data:a.png"), url(https://evil.test/p.jpg), url("data:x.png")`,
    )
  })

  it('take only absolute http and https addresses as outside links, by how the URL parser reads them', () => {
    expect(externalUrl('https://site.test/a')).toBe('https://site.test/a')
    expect(externalUrl('HTTPS://site.test')).toBe('https://site.test/')
    expect(externalUrl('https:evil.test')).toBe('https://evil.test/')
    for (const reference of ['javascript:alert(1)', 'java\tscript:alert(1)', ' javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<p>x', 'mailto:a@b.test', 'other.html', '/x', '//evil.test/a']) {
      expect(externalUrl(reference)).toBeUndefined()
    }
  })
})
