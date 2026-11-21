/** @jsxImportSource @protobase/layout */
import { Chart, Grid, Page, page } from '@protobase/layout'

// A dashboard over the hourly rollup: each chart reads a few thousand buckets instead of millions of readings.
export const energy = page(
  'energy',
  <Page title="Energy" description="The last 90 days of every meter.">
    <Grid columns={2}>
      <Chart title="Readings per day" resource="readings_hourly" groupBy="bucket" range="90d" />
      <Chart title="Average watts per day" resource="readings_hourly" groupBy="bucket" average="watts_sum" range="90d" type="line" />
      <Chart title="Cost per week by meter" resource="readings_hourly" groupBy="bucket" splitBy="meter_id" sum="cost_sum" granularity="week" range="90d" />
      <Chart title="Cost per meter" resource="readings_hourly" groupBy="meter_id" sum="cost_sum" filter="bucket >= now() - 90d" limit={5} />
    </Grid>
  </Page>,
)
