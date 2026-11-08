import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { recordingDir } from './record'
import { findLeak, keptRequestHeaders } from './scrub'

const files = readdirSync(recordingDir).filter((file) => file.endsWith('.json'))

describe('the committed APNs recordings', () => {
  it.each(files)('%s holds no provider token, key or device token, and only the kept headers', (file) => {
    const text = readFileSync(join(recordingDir, file), 'utf8')
    expect(findLeak(text, [])).toBeUndefined()
    const recording = JSON.parse(text)
    expect(Object.keys(recording.request.headers).every((name) => keptRequestHeaders.has(name))).toBe(true)
    expect(recording.device.token).toMatch(/^0{64}$/)
  })
})
