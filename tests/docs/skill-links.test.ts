import { describe, expect, it } from 'vitest'
import { linked } from '../../scripts/skill-links'

const paths = new Set(['reference/client', 'guides/deploy'])
const page = (markdown: string) => linked({ path: 'reference/cli', markdown }, paths)

describe('the skill references links', () => {
  it('makes a link to another page relative, closed by one parenthesis', () => {
    expect(page('the [global search](/reference/client/#global-search) finds it')).toBe('the [global search](client.md#global-search) finds it')
    expect(page('see [Deploy](/guides/deploy/).')).toBe('see [Deploy](../guides/deploy.md).')
  })

  it('keeps the parenthesis around a link', () => {
    expect(page('(see [Deploy](/guides/deploy/))')).toBe('(see [Deploy](../guides/deploy.md))')
  })

  it('makes a link to anything else absolute, closed by one parenthesis', () => {
    expect(page('the [API](/api/schema/)')).toBe('the [API](https://docs.protobase.net/api/schema/)')
  })

  it('leaves links in a fenced block as they are', () => {
    const fenced = '```md\n[Deploy](/guides/deploy/)\n```'
    expect(page(fenced)).toBe(fenced)
  })
})
