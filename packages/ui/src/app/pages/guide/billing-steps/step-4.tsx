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
          <Field source="plan.name" label="Plan" />
          <Field source="plan.price" label="Per month" />
          <Field source="renews_at" />
        </Grid>
        <Progress label="Seats" value="seats_used" max="plan.seats" />
        <SeatHistory months={6} />
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
    <Grid columns={3}>
      <Table title="Invoices" resource="invoices" sort="issued_at desc" limit={5} span={2} />
      <Grid columns={1}>
        <Stat label="Open invoices" resource="invoices" filter="status = 'open'" />
        <RecordCard title="Latest invoice" resource="invoices" sort="issued_at desc" actions={<Action name="download" />}>
          <Grid columns={2}>
            <Field source="number" />
            <Field source="total" />
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
