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
          <Field source="plan.name" label="Plan" />
          <Field source="plan.price" label="Per month" />
          <Field source="renews_at" />
        </Grid>
        <Progress label="Seats" value="seats_used" max="plan.seats" />
      </RecordCard>
      <RecordCard
        title="Billing details"
        resource="billing_profiles"
        actions={<ModalForm mode="edit" label="Edit" title="Edit billing details" fields={['company', 'vat_number', 'address', 'email']} />}
      >
        <Grid columns={2}>
          <Field source="company" />
          <Field source="vat_number" />
          <Field source="address" />
          <Field source="email" />
        </Grid>
      </RecordCard>
    </Grid>
  </Page>,
  { icon: 'credit-card' },
)
