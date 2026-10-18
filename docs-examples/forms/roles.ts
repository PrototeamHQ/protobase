import { defineRoles } from '@protobase/schema'

export const roles = defineRoles<'contact_requests'>({
  admin: ['*'],
  // Visitors create a contact request through the form, with these fields only, and never read one back
  anonymous: [{ 'contact_requests.create': ['name', 'email', 'topic', 'message'] }],
})
