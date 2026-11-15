import { describe, expect, it } from 'vitest'
import { exec, maxLineChars } from '../src/exec'

describe('a command the runner runs', () => {
  it('gives its output as lines, an endless line cut into lines of at most maxLineChars, keeping the end of each stream', async () => {
    const lines: [string, string][] = []
    // 200 KiB with no newline on stdout, then two lines on stderr
    const ran = await exec('sh', ['-c', `head -c ${200 * 1024} /dev/zero | tr '\\\\0' x; printf 'one\\ntwo\\n' >&2`], { line: (line, stream) => lines.push([stream, line]) })
    expect(ran.code).toBe(0)
    const out = lines.filter(([stream]) => stream === 'stdout').map(([, line]) => line)
    expect(out.every((line) => line.length <= maxLineChars)).toBe(true)
    expect(out.join('')).toHaveLength(200 * 1024)
    expect(out.length).toBe(4)
    expect(lines.filter(([stream]) => stream === 'stderr').map(([, line]) => line)).toEqual(['one', 'two'])
    expect(ran.stdout).toHaveLength(64 * 1024)
  })

  it('kills the command once its signal aborts', async () => {
    const ran = await exec('sleep', ['10'], { signal: AbortSignal.timeout(100) })
    expect(ran.code).toBe(137)
  })
})
