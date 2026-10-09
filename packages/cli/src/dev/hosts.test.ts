import { describe, expect, it } from 'vitest'
import { parseHosts } from './hosts'

describe('parseHosts', () => {
  it('splits and trims', () => {
    expect(parseHosts(' .trycloudflare.com, app.example.com ,')).toEqual(['.trycloudflare.com', 'app.example.com'])
    expect(parseHosts(undefined)).toEqual([])
  })
})
