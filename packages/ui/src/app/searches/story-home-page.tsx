/** @jsxImportSource @protobase/layout */
import { Page, RecordRow, page } from '@protobase/layout'

/** A home page for the saved searches stories: a row per saved search, under the newest homes. */
export const home = page(
  'home',
  <Page title="Find a home">
    <RecordRow title="Newest homes" resource="homes" sort="published_at desc" />
    <RecordRow title="Your searches" resource="searches" empty="Nothing yet. Filter the homes and save the search." />
  </Page>,
)
