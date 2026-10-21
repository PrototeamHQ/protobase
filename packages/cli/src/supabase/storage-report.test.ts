import { describe, expect, it } from 'vitest'
import { storageReport } from './storage-report'

const object = (name: string) => ({ bucket: 'avatars', name, version: 'v1', size: 1_000_000, eTag: undefined })

describe('storageReport', () => {
  it('counts what this run copied, found copied and failed, and lists the failures to retry', () => {
    const objects = [object('a.png'), object('b|c.png'), object('d.png')]
    const report = storageReport('https://abc.supabase.co', 'private', objects, [
      { object: objects[0]!, fault: undefined },
      { object: objects[1]!, fault: 'Supabase answered 404' },
    ])
    expect(report).toContain('From https://abc.supabase.co into the file provider `private`: 3 objects, 3.0 MB. This run copied 1, found 1 copied already and failed 1.')
    expect(report).toContain('Run `protobase import supabase --storage-url https://abc.supabase.co` again to retry these.')
    expect(report).toContain('| avatars | b\\|c.png | Supabase answered 404 |')
  })

  it('says when nothing failed', () => {
    expect(storageReport('https://abc.supabase.co', 'private', [], [])).toContain('## Failed\n\nNone.\n')
  })
})
