import { describe, expect, it } from 'vitest'
import { hasFilesToSend, isUploading, refusalOf, ticketsOf, uploadState, uploadsOf, type Upload } from './uploads'

const uploading: Upload = { key: 0, name: 'plan.pdf', size: 2_000, sent: 500 }
const done: Upload = { key: 1, name: 'shot.png', size: 48_000, sent: 48_000, ticket: 't-1' }
const refused: Upload = { key: 2, name: 'film.mov', size: 30_000_000, sent: 0, refusal: 'Too large' }

describe('uploadsOf', () => {
  it('numbers the picked files on and refuses one over the limit before it uploads', () => {
    expect(uploadsOf([{ name: 'a.txt', size: 10 }, { name: 'b.mov', size: 21_000_000 }], 4, 20_000_000)).toEqual([
      { key: 4, name: 'a.txt', size: 10, sent: 0, refusal: undefined },
      { key: 5, name: 'b.mov', size: 21_000_000, sent: 0, refusal: 'Too large: 21 MB, at most 20 MB' },
    ])
  })

  it('takes a file of exactly the limit, and any size without one', () => {
    expect(refusalOf({ name: 'a', size: 1_000 }, 1_000)).toBeUndefined()
    expect(refusalOf({ name: 'a', size: 1e12 }, undefined)).toBeUndefined()
  })
})

describe('the upload states', () => {
  it('tells a file on its way from one uploaded or refused', () => {
    expect([uploading, done, refused].map(isUploading)).toEqual([true, false, false])
    expect(ticketsOf([uploading, done, refused])).toEqual(['t-1'])
  })

  it('lets the message go without text only once a file is uploaded and none is on its way', () => {
    expect(hasFilesToSend([])).toBe(false)
    expect(hasFilesToSend([refused])).toBe(false)
    expect(hasFilesToSend([done, uploading])).toBe(false)
    expect(hasFilesToSend([done, refused])).toBe(true)
  })

  it('says how far an upload is, its size once done, and why one was refused', () => {
    expect(uploadState(uploading)).toBe('25%')
    expect(uploadState(done)).toBe('48 kB')
    expect(uploadState(refused)).toBe('Too large')
    expect(uploadState({ ...uploading, size: 0, sent: 0 })).toBe('0 bytes')
  })
})
