/** @jsxImportSource @protobase/layout */
import { Action, CardRow, Field, Grid, ModalForm, Page, Progress, RecordCard, Show, page } from '@protobase/layout'

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
    <CardRow
      title="Payment methods"
      resource="payment_methods"
      sort="is_default desc, id"
      actions={<ModalForm mode="create" label="Add card" resource="payment_methods" fields={['brand', 'last4', 'expires']} />}
    >
      <Field source="brand" label={false} />
      <Field source="last4" label="Number" />
      <Field source="expires" />
      <Show when="is_default = true">Default card</Show>
      <Show when="is_default = false">
        <Action name="makeDefault" />
        <Action name="remove" variant="danger" />
      </Show>
    </CardRow>
  </Page>,
  { icon: 'credit-card' },
)
