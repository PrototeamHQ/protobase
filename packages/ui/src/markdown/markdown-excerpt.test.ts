import { describe, expect, it } from 'vitest'
import { markdownExcerpt } from './markdown-excerpt'

describe('markdownExcerpt', () => {
  it('keeps the text of headings, lists and quotes on one line', () => {
    expect(markdownExcerpt('# Plan\n\n- [x] Order parts\n- Book the van\n1. Call back\n\n> Before Friday')).toBe('Plan Order parts Book the van Call back Before Friday')
  })

  it('keeps the text of links, images and emphasis without their marks', () => {
    expect(markdownExcerpt('**Bold**, __strong__, *it*, _em_, ~~gone~~, `code`, [docs](https://x.test), ![chart](c.png) and <https://y.test>')).toBe(
      'Bold, strong, it, em, gone, code, docs, chart and https://y.test',
    )
  })

  it('leaves words with underscores and lone stars alone', () => {
    expect(markdownExcerpt('Set snake_case_name to 2 * 3 * 4')).toBe('Set snake_case_name to 2 * 3 * 4')
  })

  it('keeps escaped marks as text', () => {
    expect(markdownExcerpt('\\*not emphasis\\* and 1\\. not a list')).toBe('*not emphasis* and 1. not a list')
  })

  it('leaves out code fences, rules, reference definitions, table rules and HTML tags', () => {
    expect(markdownExcerpt('```ts\nconst a = 1\n```\n---\n[docs]: https://x.test\n| a | b |\n| --- | :-: |\n| 1 | 2 |\n<b>bold</b> a < b')).toBe('const a = 1 a b 1 2 bold a < b')
  })

  it('cuts a long text at 200 characters', () => {
    const excerpt = markdownExcerpt('word '.repeat(100))
    expect(excerpt.length).toBeLessThanOrEqual(200)
    expect(excerpt.endsWith('word…')).toBe(true)
  })
})
