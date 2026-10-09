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
    <CardRow
      title="Payment methods"
      resource="paymentMethods"
      sort="isDefault desc, id"
      actions={<ModalForm mode="create" label="Add card" resource="paymentMethods" fields={['brand', 'last4', 'expires']} />}
    >
      <Field name="brand" label={false} />
      <Field name="last4" label="Number" />
      <Field name="expires" />
      <Show when="isDefault = true">Default card</Show>
      <Show when="isDefault = false">
        <Action name="makeDefault" />
        <Action name="remove" variant="danger" />
      </Show>
    </CardRow>
  </Page>,
  { icon: 'credit-card' },
)
