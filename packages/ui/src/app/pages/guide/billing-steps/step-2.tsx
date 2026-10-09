/** @jsxImportSource @protobase/layout */
import { Action, Field, Grid, ModalForm, Page, Progress, RecordCard, page } from '@protobase/layout'

export const billing = page(
  'billing',
  <Page title="Billing" description="Your plan, how you pay, and what you paid.">
    <Grid columns={2}>
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
      <RecordCard
        title="Billing details"
        resource="billingProfiles"
        actions={<ModalForm mode="edit" label="Edit" title="Edit billing details" fields={['company', 'vatNumber', 'address', 'email']} />}
      >
        <Grid columns={2}>
          <Field name="company" />
          <Field name="vatNumber" />
          <Field name="address" />
          <Field name="email" />
        </Grid>
      </RecordCard>
    </Grid>
  </Page>,
  { icon: 'credit-card' },
)
