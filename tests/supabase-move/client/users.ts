// The sample's users, as Supabase Auth made them (packages/cli/tests/supabase/fixtures/gotrue-users.sql), with the
// passwords they signed up with, and the file each keeps in their folder of the bucket `notes`.
export const alice = { id: '0fd5f0e7-858d-4984-ad61-299783467157', email: 'alice@example.com', password: 'short-pw1', file: "Alice's file" }
export const bob = { id: 'c659ea51-aea7-4c2c-84af-61ecccf38207', email: 'bob@example.com', password: 'bob-longer-password', file: "Bob's file" }

export const bucket = 'notes'
export const fileName = (user: { id: string }) => `${user.id}/hello.txt`
