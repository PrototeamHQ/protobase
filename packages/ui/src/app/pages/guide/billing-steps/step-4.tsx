/** @jsxImportSource @protobase/layout */
import { Action, Card, CardRow, Field, Grid, Link, ModalForm, Page, Progress, RecordCard, Show, Stat, Table, component, page } from '@protobase/layout'

/** Seats in use over the last months; the app registers the React component under this name. */
export const SeatHistory = component<{ months: number }>('SeatHistory')

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
        <SeatHistory months={6} />
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
    <Grid columns={3}>
      <Table title="Invoices" resource="invoices" sort="issuedAt desc" pageSize={5} span={2} />
      <Grid columns={1}>
        <Stat label="Open invoices" resource="invoices" filter="status = 'open'" />
        <RecordCard title="Latest invoice" resource="invoices" sort="issuedAt desc" actions={<Action name="download" />}>
          <Grid columns={2}>
            <Field name="number" />
            <Field name="total" />
          </Grid>
        </RecordCard>
        <Card title="Questions about a bill?">
          Mail <Link href="mailto:billing@example.com">billing@example.com</Link> and we answer within a day.
        </Card>
      </Grid>
    </Grid>
  </Page>,
  { icon: 'credit-card' },
)
