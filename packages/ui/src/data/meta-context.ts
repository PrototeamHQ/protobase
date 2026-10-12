import { createContext } from 'react'
import type { MetaData } from './meta-data'

/** The app's `/meta` with the resources of its sources, as `MetaGate` gives it to everything below it. */
export const MetaContext = createContext<MetaData | null>(null)
