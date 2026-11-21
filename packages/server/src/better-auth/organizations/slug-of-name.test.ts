import { describe, expect, it } from 'vitest'
import { slugForName, slugOf, slugSuffix } from './slug-of-name'

describe('slugOf', () => {
  it('lowercases, drops accents and joins the words with dashes', () => {
    expect(slugOf('  Café Zürich & Co. ')).toBe('cafe-zurich-co')
  })

  it('is empty for a name without Latin letters or digits', () => {
    expect(slugOf('日本')).toBe('')
  })

  it('keeps to 63 characters without ending on a dash', () => {
    const slug = slugOf(`${'a'.repeat(62)} b`)
    expect(slug).toBe('a'.repeat(62))
  })
})

describe('slugForName', () => {
  const none = async () => false
  const all = async () => true

  it("takes the name's slug while it is free", async () => {
    expect(await slugForName('Acme Inc', none, 'x1y2z3')).toBe('acme-inc')
  })

  it('adds the suffix when the slug is taken, asking once', async () => {
    const asked: string[] = []
    const slug = await slugForName('Acme Inc', async (slug) => { asked.push(slug); return true }, 'x1y2z3')
    expect(slug).toBe('acme-inc-x1y2z3')
    expect(asked).toEqual(['acme-inc'])
  })

  it('shortens a long slug so the suffix fits in 63 characters', async () => {
    const slug = await slugForName('a'.repeat(70), all, 'x1y2z3')
    expect(slug).toHaveLength(63)
    expect(slug.endsWith('-x1y2z3')).toBe(true)
  })

  it('is the suffix alone for a name that gives no slug', async () => {
    expect(await slugForName('日本', all, 'x1y2z3')).toBe('x1y2z3')
  })
})

describe('slugSuffix', () => {
  it('is six lowercase letters and digits', () => {
    expect(slugSuffix()).toMatch(/^[a-z0-9]{6}$/)
  })
})
