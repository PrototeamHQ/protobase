import { describe, expect, it } from 'vitest'
import { projectUrl } from './storage-url'

// The message `projectUrl` refuses `text` with, which must repeat neither `text` nor any of `secrets`.
const refusal = (text: string, secrets: string[]) => {
  let message: string | undefined
  try {
    projectUrl(text)
  } catch (error) {
    message = (error as Error).message
  }
  expect(message, `accepted ${text}`).toBeDefined()
  for (const secret of [text, ...secrets]) expect(message).not.toContain(secret)
  return message
}

describe('projectUrl', () => {
  it('keeps an https URL without its trailing slash', () => {
    expect(projectUrl('https://abc.supabase.co/')).toBe('https://abc.supabase.co')
    expect(projectUrl('https://supabase.example.org/base/')).toBe('https://supabase.example.org/base')
  })

  it('accepts plain http on localhost, 127.0.0.1 and [::1], however the host is written', () => {
    expect(projectUrl('http://127.0.0.1:54321')).toBe('http://127.0.0.1:54321')
    expect(projectUrl('http://localhost:54321')).toBe('http://localhost:54321')
    expect(projectUrl('http://LOCALHOST:54321')).toBe('http://localhost:54321')
    expect(projectUrl('http://[::1]:54321')).toBe('http://[::1]:54321')
    expect(projectUrl('http://0x7f.0.0.1:54321')).toBe('http://127.0.0.1:54321')
  })

  it('refuses plain http on any other host, asking for https without repeating the URL', () => {
    expect(refusal('http://abc.supabase.co', ['abc.supabase.co'])).toMatch(/https/)
    expect(refusal('http://abc.supabase.co:8000/storage?x=1', ['abc.supabase.co'])).toMatch(/https/)
  })

  it.each([
    ['http://localhost.evil.com', 'evil.com'],
    ['http://127.0.0.1.nip.io:54321', 'nip.io'],
    ['http://evil.com/127.0.0.1', 'evil.com'],
    ['http://evil.com?h=localhost', 'evil.com'],
    ['http://evil.com#[::1]', 'evil.com'],
    ['http://localhost.:54321', 'localhost.'],
    ['http://127.0.0.2:54321', '127.0.0.2'],
    ['http://0.0.0.0:54321', '0.0.0.0'],
    ['http://[::ffff:127.0.0.1]:54321', 'ffff'],
  ])('refuses %s, which only looks like loopback', (text, part) => {
    expect(refusal(text, [part])).toMatch(/must use https/)
  })

  it('refuses a pasted key or a URL with credentials without repeating either', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLVRFU1Q'
    refusal('sb_secret_TESTKEY', ['TESTKEY'])
    refusal(jwt, [jwt])
    refusal('https://service_role:sb_secret_TESTKEY@abc.supabase.co', ['TESTKEY', 'abc.supabase.co'])
    refusal('http://u:pw-TEST@127.0.0.1:54321', ['pw-TEST'])
  })

  it.each(['ws://127.0.0.1:54321', 'ftp://abc.supabase.co', 'file:///tmp/x', 'data:,x'])('refuses the scheme of %s', (text) => {
    expect(refusal(text, [])).toMatch(/not a URL/)
  })
})
