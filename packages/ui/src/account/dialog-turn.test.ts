import { describe, expect, it, vi } from 'vitest'
import { dialogTurn } from './dialog-turn'

describe('the turn of a dialog', () => {
  it('applies what an action answers while its dialog is still open', async () => {
    const turn = dialogTurn()
    const apply = vi.fn()
    await turn.run(async () => 'change', apply)
    expect(apply).toHaveBeenCalledWith('change')
  })

  it('finishes an action whose dialog closed, without applying its answer', async () => {
    const turn = dialogTurn()
    const apply = vi.fn()
    const added = vi.fn()
    let finish = () => {}
    const done = turn.run(() => new Promise<string>((resolve) => (finish = () => (added(), resolve('change')))), apply)
    turn.advance()
    finish()
    await done
    expect(added).toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
  })

  it('leaves a dialog opened since untouched, and applies the actions it starts', async () => {
    const turn = dialogTurn()
    const stale = vi.fn()
    let finish = () => {}
    const done = turn.run(() => new Promise<void>((resolve) => (finish = resolve)), stale)
    turn.advance()
    turn.advance()
    finish()
    await done
    expect(stale).not.toHaveBeenCalled()
    const current = vi.fn()
    await turn.run(async () => 'change', current)
    expect(current).toHaveBeenCalledWith('change')
  })
})
