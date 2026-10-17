/** @jsxImportSource @protobase/layout */
import { Page, component, page } from '@protobase/layout'

const BookRepair = component('BookRepair')

/** The page the repairs view names with `.create({ page: 'book-repair' })`, for stories. */
export const bookRepair = page(
  'book-repair',
  <Page title="Book a repair" description="What the bike needs, so the workshop can plan it.">
    <BookRepair />
  </Page>,
)
