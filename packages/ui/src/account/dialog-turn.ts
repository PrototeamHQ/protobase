/**
 * Which open of a section's dialog is the current one: each open or close `advance`s the turn, so an action started in
 * one turn hands its answer on only while that turn lasts, and a closed dialog's answer never reopens or replaces another.
 */
export const dialogTurn = () => {
  let turn = 0
  return {
    advance: () => {
      turn++
    },
    /** Runs `action` to its end, and passes its answer to `apply` only if no open or close came in between. */
    run: async <T>(action: () => Promise<T>, apply: (answer: T) => void) => {
      const started = turn
      const answer = await action()
      if (turn === started) apply(answer)
    },
  }
}
