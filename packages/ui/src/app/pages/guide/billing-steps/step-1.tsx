/** @jsxImportSource @protobase/layout */
import { Action, Field, Grid, Page, Progress, RecordCard, page } from '@protobase/layout'

export const billing = page(
  'billing',
  <Page title="Billing" description="Your plan, how you pay, and what you paid.">
    <RecordCard
      title="Your plan"
      resource="subscriptions"
      filter="status = 'active'"
      empty="You have no active plan."
      actions={[<Action name="cancel" variant="danger" />, <Action name="upgrade" variant="primary" />]}
    >
      <Grid columns={3}>
        <Field name="plan.name" label="Plan" />
        <Field name="plan.price" label="Per month" />
        <Field name="renewsAt" />
      </Grid>
      <Progress label="Seats" value="seatsUsed" max="plan.seats" />
    </RecordCard>
  </Page>,
  { icon: 'credit-card' },
)
