/** @jsxImportSource @protobase/layout */
import { Action, Field, Grid, Page, RecordCard, Show, Stat, Table, page } from '@protobase/layout'

export const overview = page(
  'overview',
  <Page title="Sales overview" description="What needs attention today.">
    <Grid columns={4}>
      <Stat label="Draft orders" resource="orders" filter="status = 'draft'" />
      <Stat label="Delivered, not paid" resource="orders" filter="status = 'delivered' AND paid = false" />
      <Stat label="Overdue invoices" resource="invoices" filter="status = 'overdue'" />
      <Stat label="Open leads" resource="companies" filter="status = 'lead'" />
    </Grid>
    <RecordCard
      title="Biggest unpaid delivery"
      resource="orders"
      filter="status = 'delivered' AND paid = false"
      sort="total desc"
      empty="Every delivered order is paid."
      actions={<Action name="markPaid" variant="primary" />}
    >
      <Grid columns={4}>
        <Field name="number" />
        <Field name="total" />
        <Field name="companyId" label="Customer" />
        <Field name="companyId.city" label="City" />
      </Grid>
      <Show when="companyId.status = 'dormant'">The customer has gone quiet: call before sending a reminder.</Show>
    </RecordCard>
    <Grid columns={2}>
      <Table title="Overdue invoices" resource="invoices" filter="status = 'overdue'" sort="issuedAt" columns={['number', 'companyId', 'dueAt', 'total']} pageSize={2} empty="Nothing is overdue." />
      <Table title="Latest orders" resource="orders" sort="createdAt desc" columns={['number', 'companyId', 'status', 'total']} pageSize={5} />
    </Grid>
  </Page>,
  { nav: { group: 'Sales', order: 0 }, icon: 'layout-dashboard' },
)
