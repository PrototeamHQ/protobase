import { describe, expect, it } from 'vitest'
import { carriesFiles, pastedFiles } from './composer-files'

const transfer = (types: string[], files: File[] = []) => ({ types, files: files as unknown as FileList })
const shot = new File(['png'], 'shot.png', { type: 'image/png' })

describe('pastedFiles', () => {
  it('gives the files of a paste of files alone', () => {
    expect(pastedFiles(transfer(['Files'], [shot]))).toEqual([shot])
  })

  it('gives none for a paste of text', () => {
    expect(pastedFiles(transfer(['text/plain']))).toEqual([])
  })

  it('gives none for a paste of text that holds an image too', () => {
    expect(pastedFiles(transfer(['text/plain', 'text/html', 'Files'], [shot]))).toEqual([])
  })
})

describe('carriesFiles', () => {
  it('tells a drag of files from a drag of text', () => {
    expect(carriesFiles(transfer(['Files']))).toBe(true)
    expect(carriesFiles(transfer(['text/plain']))).toBe(false)
  })
})
