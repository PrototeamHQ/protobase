/** @jsxImportSource @protobase/layout */
import { Action, Field, Page, RecordCard, page } from '@protobase/layout'

export const overview = page(
  'overview',
  <Page title="Overview">
    <RecordCard title="Biggest unpaid delivery" resource="orders" filter="status = 'delivered' AND paid = false" sort="total desc" actions={<Action name="renumber" />}>
      <Field name="number" />
    </RecordCard>
  </Page>,
)
