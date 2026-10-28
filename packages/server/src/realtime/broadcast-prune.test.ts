import { describe, expect, it, vi } from 'vitest'
import { inBatches } from './broadcast-prune'

describe('inBatches', () => {
  it('deletes batch after batch until one comes back short', async () => {
    let left = 5
    const deleteBatch = vi.fn(async (limit: number) => {
      const deleted = Math.min(limit, left)
      left -= deleted
      return deleted
    })
    await inBatches(2, deleteBatch)
    expect(deleteBatch).toHaveBeenCalledTimes(3)
    expect(deleteBatch).toHaveBeenCalledWith(2)
    expect(left).toBe(0)
  })

  it('stops after one statement when the first batch is short, an empty one too', async () => {
    const deleteBatch = vi.fn(async () => 0)
    await inBatches(1000, deleteBatch)
    expect(deleteBatch).toHaveBeenCalledTimes(1)
  })

  it('drains a batch that comes back exactly full with one more, empty, statement', async () => {
    const deleteBatch = vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(0)
    await inBatches(2, deleteBatch)
    expect(deleteBatch).toHaveBeenCalledTimes(2)
  })
})
