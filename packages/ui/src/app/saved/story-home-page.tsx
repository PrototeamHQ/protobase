/** @jsxImportSource @protobase/layout */
import { Page, RecordRow, page } from '@protobase/layout'

/** A home page for the favorites stories: the member's favorites as a row of the homes' cards. */
export const home = page(
  'home',
  <Page title="Find a home">
    <RecordRow title="Your favorites" resource="favorites" empty="Save a home with the heart on its card." />
  </Page>,
)
