/** @jsxImportSource @protobase/layout */
import { Grid, Page, Stat, page } from '@protobase/layout'

export const overview = page(
  'overview',
  <Page title="Sales overview" description="What needs attention today.">
    <Grid columns={4}>
      <Stat label="Draft orders" resource="orders" filter="status = 'draft'" />
      <Stat label="Delivered, not paid" resource="orders" filter="status = 'delivered' AND paid = false" />
      <Stat label="Overdue invoices" resource="invoices" filter="status = 'overdue'" />
      <Stat label="Open leads" resource="companies" filter="status = 'lead'" />
    </Grid>
  </Page>,
  { nav: { group: 'Sales', order: 0 }, icon: 'layout-dashboard' },
)
