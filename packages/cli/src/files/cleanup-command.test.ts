import { describe, expect, it } from 'vitest'
import { cleanupCommand } from './cleanup-command'

const output = async (report: { deleted: string[]; kept: string[] }) => {
  let text = ''
  await cleanupCommand(async () => report, (chunk) => { text += chunk })
  return text
}

describe('protobase files cleanup', () => {
  it('lists the deleted and the kept files', async () => {
    expect(await output({ deleted: ['private:1/a.png', 'private:1/b.png'], kept: ['public:_/c.png'] })).toBe(
      'Deleted 2 files:\n  private:1/a.png\n  private:1/b.png\nKept 1 file a row references again:\n  public:_/c.png\n',
    )
  })

  it('says when nothing was due', async () => {
    expect(await output({ deleted: [], kept: [] })).toBe('No file deletes were due\n')
  })
})
