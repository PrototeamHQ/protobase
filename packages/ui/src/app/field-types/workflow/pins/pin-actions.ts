import { createContext, useContext } from 'react'

/** What the pins on the canvas can do: change a step's argument in place, and open or fold a node's optional inputs. */
export type PinActions = {
  setArgument: (step: string, keys: readonly string[], value: unknown) => void
  toggleOpen: (node: string) => void
}

export const PinActionsContext = createContext<PinActions | undefined>(undefined)

/** The pins' actions where the canvas is editable; undefined where it is only shown. */
export const usePinActions = () => useContext(PinActionsContext)
