import { createContext } from 'react'

/** What a moved node's mark does where the canvas takes changes: hands the node, by its canvas id, back to the layout. */
export const UnpinContext = createContext<((node: string) => void) | undefined>(undefined)
