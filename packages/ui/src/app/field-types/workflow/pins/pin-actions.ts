import { createContext, useContext } from 'react'

/**
 * What the pins on the canvas can do: change a step's argument in place, a value of a condition node's side at `at`
 * among the step's Condition's nodes, or the whole Condition as an Expression writes it, and open or fold a node's
 * optional inputs.
 */
export type PinActions = {
  setArgument: (step: string, keys: readonly string[], value: unknown) => void
  setConditionSide: (step: string, at: readonly number[], value: string | number | boolean) => void
  setCondition: (step: string, value: string | undefined) => void
  toggleOpen: (node: string) => void
}

export const PinActionsContext = createContext<PinActions | undefined>(undefined)

/** The pins' actions where the canvas is editable; undefined where it is only shown. */
export const usePinActions = () => useContext(PinActionsContext)
