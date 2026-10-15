/** @jsxImportSource @protobase/layout */
import { Page, RecordRow, page } from '@protobase/layout'

/** The page the record row stories show: three rows of homes, one capped and one that finds nothing. */
export const home = page(
  'home',
  <Page title="Find a home">
    <RecordRow title="With a garden" resource="homes" filter="garden = true" sort="published_at desc" />
    <RecordRow title="Under €1,300" resource="homes" filter="rent <= 1300" limit={3} />
    <RecordRow title="Over €5,000" resource="homes" filter="rent >= 5000" empty="Nothing that dear yet." />
  </Page>,
)
