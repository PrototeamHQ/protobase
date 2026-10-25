/** @jsxImportSource @protobase/layout */
import { Page, Settings, Tab, Tabs, accountTabs, page } from '@protobase/layout'

/** The standard account page with a Notifications tab, where each person picks the emails they get. */
export const account = page(
  'account',
  <Page title="Account">
    <Tabs>
      {accountTabs.profile}
      {accountTabs.security}
      <Tab name="notifications" label="Notifications">
        <Settings resource="notification_settings" title="Emails" description="What the ERP emails you about." />
      </Tab>
      {accountTabs.devices}
      {accountTabs.apps}
    </Tabs>
  </Page>,
)
