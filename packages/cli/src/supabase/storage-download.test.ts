import { describe, expect, it } from 'vitest'
import { objectUrl } from './storage-download'

describe('objectUrl', () => {
  it("addresses the object under the project's Storage API, each segment of the name encoded", () => {
    expect(objectUrl('https://abc.supabase.co/', 'avatars', 'users/1/my photo #1.png')).toBe('https://abc.supabase.co/storage/v1/object/authenticated/avatars/users/1/my%20photo%20%231.png')
  })
})
