import { appPath } from '@protobase/schema'
import { sendNotification, subscription } from '@protobase/server'

// The app's public origin: the address its sign-in runs on, from its own configuration.
const appOrigin = process.env.BETTER_AUTH_URL ?? 'http://localhost:5173'

/** Tells an order's owner when its status changes, in their inbox and as push, with a link to the order. */
export const orderStatusToOwner = subscription('orderStatusToOwner', {
  events: ['orders.statusChanged'],
  run: async ({ data }, { db }) => {
    const owner = data.after?.owner_id
    if (owner == null) return
    const url = new URL(appPath({ kind: 'record', resource: 'orders', key: data.key }), appOrigin).href
    await sendNotification(db, { userIds: [String(owner)], inbox: true }, { title: `Order ${data.after?.number} changed status`, url })
  },
})
