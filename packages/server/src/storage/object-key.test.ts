import { describe, expect, it } from 'vitest'
import { isFilePath } from '../files/uri'
import { checkedBucketId, checkedName, objectKey } from './object-key'

describe('checkedBucketId', () => {
  it('takes the names Supabase Storage takes, and refuses a slash, an empty or a long one', () => {
    expect(checkedBucketId('avatars')).toBe('avatars')
    expect(checkedBucketId('my bucket (2)')).toBe('my bucket (2)')
    for (const id of ['', 'a/b', 'x'.repeat(101), 'tab\there']) expect(() => checkedBucketId(id)).toThrow('Bucket name invalid')
  })
})

describe('checkedName', () => {
  it('takes folders and any printable character', () => {
    expect(checkedName('user-1/avatar 1.png')).toBe('user-1/avatar 1.png')
    expect(checkedName('dossiers/été/rapport #3.pdf')).toBe('dossiers/été/rapport #3.pdf')
  })

  it('refuses empty folders, dot folders, control characters and names over 1024 bytes', () => {
    for (const name of ['', '/a', 'a/', 'a//b', '../a', 'a/./b', 'a\nb', 'é'.repeat(513)]) expect(() => checkedName(name)).toThrow('Invalid key')
  })
})

describe('objectKey', () => {
  it('is a provider path of its own per bucket, name and version', async () => {
    const key = await objectKey('avatars', 'user-1/a.png', '7b2c')
    expect(key).toMatch(/^storage\/[0-9a-f]{64}\/7b2c$/)
    expect(isFilePath(key)).toBe(true)
    expect(await objectKey('avatars', 'user-1/a.png', '7b2c')).toBe(key)
    expect(await objectKey('avatar', 'suser-1/a.png', '7b2c')).not.toBe(key)
    expect(await objectKey('avatars', 'user-1/a.png', null)).toBe(key.replace('7b2c', 'unversioned'))
  })
})
