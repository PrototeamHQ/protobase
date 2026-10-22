import { describe, expect, it } from 'vitest'
import { withApiOrigin } from './api-origin-page'

describe('withApiOrigin', () => {
  it('names the API origin in a meta tag before </head>, escaped', () => {
    expect(withApiOrigin('<html><head><title>x</title></head></html>', 'https://a.com')).toBe('<html><head><title>x</title><meta name="protobase-api-origin" content="https://a.com"></head></html>')
    expect(withApiOrigin('<head></head>', 'https://a.com/"><script>')).toContain('content="https://a.com/&quot;&gt;&lt;script&gt;"')
    expect(() => withApiOrigin('<body></body>', 'https://a.com')).toThrow('has no </head>')
  })
})
