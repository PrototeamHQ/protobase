import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { ApiError, type RuntimeStatus } from '@protobase/client'
import { RuntimeUpdateDialog, type RuntimeUpdateDialogProps } from './runtime-update-dialog'

const meta = { title: 'Shell/Runtime update dialog', parameters: { layout: 'fullscreen' } } satisfies Meta
export default meta

const behind: RuntimeStatus = { version: '0.18.0', latest: '0.19.1', updateAvailable: true, indicator: true, policy: 'manual', nextUpdateAt: null, updating: false }
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

const dialog = (status: RuntimeStatus, props: Partial<RuntimeUpdateDialogProps> = {}) => () => (
  <RuntimeUpdateDialog status={status} requesting={false} error={undefined} checkError={undefined} onUpdate={() => undefined} onClose={() => undefined} {...props} />
)

/** An update runs: the dialog names its stage and how long ago it started, and "Update now" waits for it. */
export const Running: StoryObj = {
  tags: ['play'],
  render: dialog({ ...behind, updating: true, updateStage: 'build', updateStartedAt: minutesAgo(3) }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Building, started 3 min ago')).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Updating…' })).toBeDisabled()
  },
}

/** The last update failed: the dialog says so with the endpoint's message, and the update can be tried again. */
export const Failed: StoryObj = {
  tags: ['play'],
  render: dialog({
    ...behind,
    lastUpdate: { toVersion: '0.19.1', outcome: 'failed', errorCode: 'doctor_failed', message: "The app's config does not pass protobase doctor with the release", finishedAt: '2026-10-12T03:07:00.000Z' },
  }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/^The update to 0\.19\.1 failed on 12 Oct 2026, 03:07 UTC: The app's config/)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Update now' })).toBeEnabled()
  },
}

/** The last update succeeded: the app runs the latest version and the dialog says when it got there. */
export const Succeeded: StoryObj = {
  render: dialog({
    ...behind,
    version: '0.19.1',
    updateAvailable: false,
    lastUpdate: { toVersion: '0.19.1', outcome: 'succeeded', errorCode: null, message: null, finishedAt: '2026-10-12T03:12:00.000Z' },
  }),
}

/** "Update now" was refused: the dialog shows the endpoint's own message. */
export const Refused: StoryObj = {
  render: dialog(behind, { error: new ApiError({ type: 'urn:protobase:problem:update_running', title: 'Conflict', status: 409, detail: "An update of the app's runtime is running" }) }),
}
