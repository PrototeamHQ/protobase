import { view } from '@protobase/schema'
import type { customers, repairs } from './data'

// Step 1: an entry in the sidebar for each table, and nothing else. Lists and record pages work from the data config.

export const customersView = view<typeof customers>('customers')

export const repairsView = view<typeof repairs>('repairs')
