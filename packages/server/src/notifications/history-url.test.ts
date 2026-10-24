import { describe, expect, it } from 'vitest'
import { historyUrl } from './history-url'

const origins = ['https://app.example.com', 'https://admin.example.com']

describe('the url a history entry shows', () => {
  it.each(['/tasks/1', '/tasks/1?tab=comments#c2', '/'])('keeps the path %s', (url) => {
    expect(historyUrl(url, origins)).toBe(url)
  })

  it('keeps an absolute URL on one of the app origins, as the parser writes it', () => {
    expect(historyUrl('https://app.example.com/tasks/1', origins)).toBe('https://app.example.com/tasks/1')
    expect(historyUrl('HTTPS://ADMIN.example.com:443/x', origins)).toBe('https://admin.example.com/x')
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/a b',
    'https://evil.example',
    'https://app.example.com.evil.com/',
    'https://app.example.com@evil.com/',
    'https://user:pass@app.example.com/',
    'https://evil.com/https://app.example.com',
    'http://app.example.com/',
    'https://evil.example.com',
    'tasks/1',
    ' /tasks/1',
    `/${'x'.repeat(2048)}`,
  ])('answers null for %s', (url) => {
    expect(historyUrl(url, [...origins, 'https://*.example.com'])).toBeNull()
  })

  it('keeps paths only for an app without origins', () => {
    expect(historyUrl('https://app.example.com/tasks/1', [])).toBeNull()
    expect(historyUrl('/tasks/1', [])).toBe('/tasks/1')
    expect(historyUrl(null, origins)).toBeNull()
  })
})
