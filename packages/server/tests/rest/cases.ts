/**
 * The requests the `/rest/v1` tests send, in order, as supabase-js sends them: the query as `URLSearchParams` writes
 * it. `record-postgrest.ts` sends them to a real PostgREST and keeps its answers in `postgrest.json`; `rest.test.ts`
 * sends them to Protobase and expects the same answers. Writes change what later requests see, on both sides alike.
 * `loose` compares an error's status and code only, for PostgREST's parser messages, which no other parser repeats.
 */
export type RestCase = {
  name: string
  as: 'anon' | 'alice' | 'service'
  method: 'GET' | 'HEAD' | 'POST' | 'PATCH' | 'DELETE'
  /** `/todos` or `/rpc/add`. */
  path: string
  query?: [string, string][]
  headers?: Record<string, string>
  body?: unknown
  loose?: true
}

const object = { accept: 'application/vnd.pgrst.object+json' }
const representation = { prefer: 'return=representation' }
const todo = 'id,title,done,priority'

export const restCases: RestCase[] = [
  // Reads, and the filters
  { name: 'anon reads every profile', as: 'anon', method: 'GET', path: '/profiles', query: [['select', '*'], ['order', 'username']] },
  { name: 'anon reads no todo under RLS', as: 'anon', method: 'GET', path: '/todos', query: [['select', '*']] },
  { name: 'alice reads her own todos only', as: 'alice', method: 'GET', path: '/todos', query: [['select', '*'], ['order', 'id']] },
  { name: 'eq', as: 'alice', method: 'GET', path: '/todos', query: [['select', todo], ['priority', 'eq.1'], ['order', 'id']] },
  { name: 'neq', as: 'alice', method: 'GET', path: '/todos', query: [['select', todo], ['priority', 'neq.1'], ['order', 'id']] },
  { name: 'gt and lte', as: 'alice', method: 'GET', path: '/todos', query: [['select', todo], ['priority', 'gt.1'], ['priority', 'lte.2'], ['order', 'id']] },
  { name: 'gte and lt on a date', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,due'], ['due', 'gte.2026-03-02'], ['due', 'lt.2026-06-30'], ['order', 'id']] },
  { name: 'like with stars', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,title'], ['title', 'like.*milk*'], ['order', 'id']] },
  { name: 'ilike', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,title'], ['title', 'ilike.buy*'], ['order', 'id']] },
  { name: 'match and imatch', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,title'], ['title', 'match.^[A-Z]'], ['title', 'imatch.the'], ['order', 'id']] },
  { name: 'in with a quoted value', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,title'], ['title', 'in.("Buy milk","Write report",x)'], ['order', 'id']] },
  { name: 'in with nothing', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['id', 'in.()']] },
  { name: 'is null', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['priority', 'is.null']] },
  { name: 'is true and is false', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['done', 'is.true'], ['order', 'id']] },
  { name: 'not.is.null', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['due', 'not.is.null'], ['order', 'id']] },
  { name: 'isdistinct', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['priority', 'isdistinct.1'], ['order', 'id']] },
  { name: 'not.eq', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['done', 'not.eq.true'], ['order', 'id']] },
  { name: 'fts with a language', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,title'], ['search', 'fts(english).milk & buy'], ['order', 'id']] },
  { name: 'plfts', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['search', 'plfts.bread milk'], ['order', 'id']] },
  { name: 'phfts', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['search', 'phfts(english).the plumber'], ['order', 'id']] },
  { name: 'wfts', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['search', 'wfts(english).milk -bread'], ['order', 'id']] },
  { name: 'cs on an array', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,tags'], ['tags', 'cs.{home}'], ['order', 'id']] },
  { name: 'cd on an array', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,tags'], ['tags', 'cd.{home,shopping}'], ['order', 'id']] },
  { name: 'ov on an array', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['tags', 'ov.{code,shopping}'], ['order', 'id']] },
  { name: 'cs on JSON', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,meta'], ['meta', 'cs.{"kind":"errand"}'], ['order', 'id']] },
  { name: 'range operators', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['during', 'sl.[2026-03-04 00:00+00,2026-03-10 00:00+00)'], ['order', 'id']] },
  { name: 'adj', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['during', 'adj.[2026-03-01 09:00+00,2026-03-01 10:00+00)']] },
  { name: 'nxr and nxl', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['during', 'nxr.[2026-03-01 00:00+00,2026-03-04 00:00+00)'], ['during', 'nxl.[2026-03-01 00:00+00,2026-03-02 00:00+00)'], ['order', 'id']] },
  { name: 'a filter on a JSON path', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['meta->>kind', 'eq.work'], ['order', 'id']] },
  { name: 'eq(any)', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['priority', 'eq(any).{1,3}'], ['order', 'id']] },
  { name: 'like(all)', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['title', 'like(all).{*Buy*,*milk*}'], ['order', 'id']] },
  { name: 'or', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['or', '(priority.eq.3,done.is.true)'], ['order', 'id']] },
  { name: 'or with nested and, not and quoted values', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['or', '(title.eq."Buy milk",and(priority.gte.3,done.not.is.true),not.and(tags.cs.{code,work},id.gt.2))'], ['order', 'id']] },
  { name: 'not.or beside a filter', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['not.or', '(priority.eq.1,priority.is.null)'], ['done', 'eq.false'], ['order', 'id']] },
  { name: 'and with in', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['and', '(priority.in.(1,2),title.ilike.*the*)'], ['order', 'id']] },

  // select
  { name: 'aliases and casts', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'key:id,title,priority::text,label:title::varchar'], ['id', 'lte.2'], ['order', 'id']] },
  { name: 'JSON paths in select', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,meta->kind,cost:meta->>cost,meta->>pages'], ['id', 'lte.3'], ['order', 'id']] },
  { name: 'spaces in select', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id, title'], ['id', 'eq.1']] },
  { name: 'an unknown column', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,colour']] },

  // order, limit, offset and Range
  { name: 'order desc nulls last and a second column', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,priority'], ['order', 'priority.desc.nullslast,id.asc']] },
  { name: 'order nulls first', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,priority'], ['order', 'priority.asc.nullsfirst,id']] },
  { name: 'limit and offset', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['order', 'id'], ['limit', '2'], ['offset', '1']] },
  { name: 'a Range header', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['order', 'id']], headers: { range: '2-4', 'range-unit': 'items' } },
  { name: 'an open Range header', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['order', 'id']], headers: { range: '5-' } },

  // count
  { name: 'count=exact over a page', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['order', 'id'], ['limit', '2']], headers: { prefer: 'count=exact' } },
  { name: 'count=exact over all rows', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['priority', 'eq.3']], headers: { prefer: 'count=exact' } },
  { name: 'count=exact past the end', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['offset', '20']], headers: { prefer: 'count=exact' } },
  { name: 'count=exact with HEAD', as: 'alice', method: 'HEAD', path: '/todos', query: [['select', '*']], headers: { prefer: 'count=exact' } },
  { name: 'count=planned', as: 'service', method: 'GET', path: '/todos', query: [['select', 'id'], ['order', 'id'], ['limit', '1']], headers: { prefer: 'count=planned' } },
  { name: 'count=estimated', as: 'service', method: 'GET', path: '/todos', query: [['select', 'id'], ['order', 'id'], ['limit', '1']], headers: { prefer: 'count=estimated' } },

  // single and maybeSingle
  { name: 'one row as an object', as: 'alice', method: 'GET', path: '/todos', query: [['select', todo], ['id', 'eq.1']], headers: object },
  { name: 'no row as an object', as: 'alice', method: 'GET', path: '/todos', query: [['select', todo], ['id', 'eq.8']], headers: object },
  { name: 'several rows as an object', as: 'alice', method: 'GET', path: '/todos', query: [['select', todo], ['priority', 'eq.1']], headers: object },

  // Errors
  { name: 'an unknown table', as: 'alice', method: 'GET', path: '/xyzzy', query: [['select', '*']] },
  { name: 'an unknown operator', as: 'alice', method: 'GET', path: '/todos', query: [['id', 'near.1']], loose: true },
  { name: 'a value of the wrong type', as: 'alice', method: 'GET', path: '/todos', query: [['priority', 'eq.high']] },

  // Embeds
  { name: 'many-to-one', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,title,profiles(username)'], ['id', 'lte.3'], ['order', 'id']] },
  { name: 'many-to-one with an alias and every column', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,owner:profiles(*)'], ['id', 'eq.1']] },
  { name: 'one-to-many under RLS', as: 'alice', method: 'GET', path: '/profiles', query: [['select', 'username,todos(id,title)'], ['order', 'username'], ['todos.order', 'id']] },
  { name: 'one-to-many as anon', as: 'anon', method: 'GET', path: '/profiles', query: [['select', 'username,todos(id)'], ['order', 'username']] },
  { name: 'nested embeds', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,comments(body,author:profiles(username))'], ['id', 'lte.3'], ['order', 'id'], ['comments.order', 'id']] },
  { name: 'one-to-one from the referenced table', as: 'anon', method: 'GET', path: '/profiles', query: [['select', 'username,profile_settings(theme)'], ['order', 'username']] },
  { name: 'one-to-one from the referencing table', as: 'anon', method: 'GET', path: '/profile_settings', query: [['select', 'theme,profiles(username)'], ['order', 'profile_id']] },
  { name: 'a filter on an embedded table', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,comments(id,likes)'], ['comments.likes', 'gte.2'], ['id', 'lte.3'], ['order', 'id']] },
  { name: 'or on an embedded table', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,comments(id)'], ['comments.or', '(likes.eq.0,likes.gte.5)'], ['id', 'lte.3'], ['order', 'id'], ['comments.order', 'id']] },
  { name: 'order, limit and offset on an embedded table', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,comments(id)'], ['comments.order', 'id.desc'], ['comments.limit', '1'], ['comments.offset', '1'], ['id', 'lte.3'], ['order', 'id']] },
  { name: 'an inner embed', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,comments!inner(id)'], ['comments.likes', 'gte.2'], ['order', 'id']] },
  { name: 'an inner many-to-one filtered through its alias', as: 'alice', method: 'GET', path: '/comments', query: [['select', 'id,author:profiles!inner(username)'], ['author.username', 'eq.bob'], ['order', 'id']] },
  { name: 'a many-to-one filtered to nothing', as: 'alice', method: 'GET', path: '/comments', query: [['select', 'id,profiles(username)'], ['profiles.username', 'eq.bob'], ['order', 'id']] },
  { name: 'an empty embed', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,comments()'], ['id', 'eq.1']] },
  { name: 'an embed as an object', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,profiles(username),comments(id)'], ['id', 'eq.1'], ['comments.order', 'id']], headers: object },
  { name: 'an ambiguous embed', as: 'alice', method: 'GET', path: '/messages', query: [['select', 'body,profiles(username)']] },
  { name: 'hints by foreign key name', as: 'alice', method: 'GET', path: '/messages', query: [['select', 'id,from:profiles!messages_sender_id_fkey(username),to:profiles!messages_receiver_id_fkey(username)'], ['order', 'id']] },
  { name: 'a hint by column', as: 'alice', method: 'GET', path: '/messages', query: [['select', 'id,profiles!receiver_id(username)'], ['order', 'id']] },
  { name: 'a hint on a one-to-many', as: 'alice', method: 'GET', path: '/profiles', query: [['select', 'username,sent:messages!sender_id(body)'], ['order', 'username'], ['sent.order', 'id']] },
  { name: 'no relationship', as: 'alice', method: 'GET', path: '/todos', query: [['select', '*,messages(*)']] },
  { name: 'an unknown embedded table', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,xyzzy(*)']] },
  { name: 'a filter on a resource not embedded', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id'], ['comments.likes', 'eq.1']] },
  { name: 'an unknown column in an embed', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,profiles(colour)']] },

  // Inserts
  { name: 'insert one and return it', as: 'alice', method: 'POST', path: '/todos', query: [['select', 'id,user_id,title,done,priority,tags']], headers: representation, body: { title: 'Pay rent', priority: 2 } },
  { name: 'insert several, missing columns null', as: 'alice', method: 'POST', path: '/todos', query: [['columns', '"title","priority"'], ['select', 'id,title,priority,done']], headers: representation, body: [{ title: 'Read a book', priority: 1 }, { title: 'Go running' }] },
  { name: 'insert several, a missing column null against its constraint', as: 'alice', method: 'POST', path: '/todos', query: [['columns', '"title","done"']], body: [{ title: 'Swim', done: true }, { title: 'Cycle' }] },
  { name: 'insert several with other keys and no columns', as: 'alice', method: 'POST', path: '/todos', body: [{ title: 'Swim', done: true }, { title: 'Cycle' }] },
  { name: 'insert several, missing columns default', as: 'alice', method: 'POST', path: '/todos', query: [['columns', '"title","done","tags"'], ['select', 'id,title,done,tags']], headers: { prefer: 'return=representation,missing=default' }, body: [{ title: 'Bake a cake', done: true }, { title: 'Phone mum', tags: ['family'] }] },
  { name: 'insert with missing=default and an explicit null', as: 'alice', method: 'POST', path: '/todos', query: [['select', 'title,tags']], headers: { prefer: 'return=representation,missing=default' }, body: { title: 'Paint the fence', tags: null } },
  { name: 'insert returning an embed', as: 'alice', method: 'POST', path: '/todos', query: [['select', 'title,profiles(username)']], headers: representation, body: { title: 'Pay the bills' } },
  { name: 'insert minimal', as: 'alice', method: 'POST', path: '/todos', body: { title: 'Wash the car' } },
  { name: 'insert minimal with a count', as: 'alice', method: 'POST', path: '/todos', headers: { prefer: 'return=minimal,count=exact' }, body: [{ title: 'Tidy up' }, { title: 'Sleep' }] },
  { name: 'insert as an object', as: 'alice', method: 'POST', path: '/todos', query: [['select', 'id,title']], headers: { ...representation, ...object }, body: { title: 'Feed the cat', meta: { kind: 'pet' } } },
  { name: 'insert another user\'s row', as: 'alice', method: 'POST', path: '/todos', headers: representation, body: { title: 'Sneaky', user_id: '1a1a1a1a-0000-0000-0000-000000000002' } },
  { name: 'insert as anon', as: 'anon', method: 'POST', path: '/todos', body: { title: 'Anonymous', user_id: '1a1a1a1a-0000-0000-0000-000000000001' } },
  { name: 'insert without a required column', as: 'alice', method: 'POST', path: '/todos', body: { priority: 1 } },
  { name: 'insert a duplicate', as: 'service', method: 'POST', path: '/profiles', body: { id: '1a1a1a1a-0000-0000-0000-000000000009', username: 'alice' } },
  { name: 'alice reads her todos after inserting', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,title,done,priority,tags,meta'], ['id', 'gt.10'], ['order', 'id']] },

  // Upserts
  { name: 'upsert merging on a unique column', as: 'service', method: 'POST', path: '/profiles', query: [['on_conflict', 'username'], ['select', 'username,full_name,website']], headers: { prefer: 'resolution=merge-duplicates,return=representation' }, body: [{ id: '1a1a1a1a-0000-0000-0000-000000000003', username: 'carol', full_name: 'Carol Clark' }, { id: '1a1a1a1a-0000-0000-0000-000000000004', username: 'dave', full_name: 'Dave Davis' }] },
  { name: 'upsert ignoring duplicates', as: 'service', method: 'POST', path: '/profiles', query: [['on_conflict', 'username'], ['columns', '"id","username","full_name"']], headers: { prefer: 'resolution=ignore-duplicates,return=representation' }, body: [{ id: '1a1a1a1a-0000-0000-0000-000000000003', username: 'carol', full_name: 'Not Carol' }, { id: '1a1a1a1a-0000-0000-0000-000000000005', username: 'erin' }] },
  { name: 'upsert on the primary key', as: 'alice', method: 'POST', path: '/todos', query: [['select', 'id,title,done']], headers: { prefer: 'resolution=merge-duplicates,return=representation' }, body: { id: 4, title: 'Plan the summer holiday', done: false } },
  { name: 'upsert minimal', as: 'alice', method: 'POST', path: '/todos', headers: { prefer: 'resolution=merge-duplicates,return=minimal' }, body: { id: 4, title: 'Plan the summer holiday', done: false } },
  { name: 'upsert of another user\'s row', as: 'alice', method: 'POST', path: '/todos', headers: { prefer: 'resolution=merge-duplicates' }, body: { id: 8, title: 'Mine now' } },

  // Updates
  { name: 'update and return', as: 'alice', method: 'PATCH', path: '/todos', query: [['id', 'eq.1'], ['select', todo]], headers: representation, body: { done: true, priority: 2 } },
  { name: 'update minimal', as: 'alice', method: 'PATCH', path: '/todos', query: [['id', 'in.(2,6)']], body: { tags: ['work', 'urgent'] } },
  { name: 'update minimal with a count', as: 'alice', method: 'PATCH', path: '/todos', query: [['priority', 'eq.1']], headers: { prefer: 'return=minimal,count=exact' }, body: { notes: 'soon' } },
  { name: 'update another user\'s row', as: 'alice', method: 'PATCH', path: '/todos', query: [['id', 'eq.8']], headers: representation, body: { title: 'Mine now' } },
  { name: 'update several rows as an object', as: 'alice', method: 'PATCH', path: '/todos', query: [['done', 'is.true']], headers: { ...representation, ...object }, body: { title: 'Done' } },
  { name: 'the object update rolled back', as: 'alice', method: 'GET', path: '/todos', query: [['select', 'id,title,done,priority,tags,notes'], ['order', 'id'], ['limit', '7']] },

  // Deletes
  { name: 'delete and return', as: 'alice', method: 'DELETE', path: '/todos', query: [['id', 'eq.7'], ['select', 'id,title']], headers: representation },
  { name: 'delete minimal', as: 'alice', method: 'DELETE', path: '/todos', query: [['title', 'eq.Sleep']] },
  { name: 'delete another user\'s row', as: 'alice', method: 'DELETE', path: '/todos', query: [['id', 'eq.9']], headers: { prefer: 'return=representation,count=exact' } },
  { name: 'bob still has his todos', as: 'service', method: 'GET', path: '/todos', query: [['select', 'id,title'], ['user_id', 'eq.1a1a1a1a-0000-0000-0000-000000000002'], ['order', 'id']] },

  // Functions
  { name: 'rpc by POST', as: 'anon', method: 'POST', path: '/rpc/add', body: { a: 1, b: 2 } },
  { name: 'rpc by GET', as: 'anon', method: 'GET', path: '/rpc/add', query: [['a', '40'], ['b', '2']] },
  { name: 'rpc under RLS', as: 'alice', method: 'POST', path: '/rpc/todo_count', body: {} },
  { name: 'rpc under RLS as anon', as: 'anon', method: 'POST', path: '/rpc/todo_count' },
  { name: 'rpc returning rows, shaped', as: 'alice', method: 'POST', path: '/rpc/open_todos', query: [['select', 'id,title'], ['order', 'id.desc'], ['limit', '2']], body: { min_priority: 2 } },
  { name: 'rpc returning rows, filtered', as: 'alice', method: 'GET', path: '/rpc/open_todos', query: [['select', 'id'], ['id', 'lt.100'], ['order', 'id']] },
  { name: 'rpc returning rows with a count', as: 'alice', method: 'GET', path: '/rpc/open_todos', query: [['select', 'id'], ['order', 'id'], ['limit', '1']], headers: { prefer: 'count=exact' } },
  { name: 'rpc returning a table', as: 'anon', method: 'POST', path: '/rpc/usernames', body: { prefix: 'c' } },
  { name: 'rpc returning one row', as: 'alice', method: 'POST', path: '/rpc/first_todo', query: [['select', 'id,title']] },
  { name: 'rpc returning scalars', as: 'alice', method: 'GET', path: '/rpc/priorities' },
  { name: 'rpc returning rows as an object', as: 'alice', method: 'POST', path: '/rpc/open_todos', query: [['select', 'id'], ['id', 'eq.2']], headers: object, body: {} },
  { name: 'rpc returning void', as: 'alice', method: 'POST', path: '/rpc/finish_todo', body: { todo_id: 2 } },
  { name: 'rpc that writes, by GET', as: 'alice', method: 'GET', path: '/rpc/finish_todo', query: [['todo_id', '6']] },
  { name: 'rpc reading the claims as alice', as: 'alice', method: 'POST', path: '/rpc/whoami' },
  { name: 'rpc reading the claims as anon', as: 'anon', method: 'POST', path: '/rpc/whoami' },
  { name: 'rpc reading the claims with the secret key', as: 'service', method: 'GET', path: '/rpc/whoami' },
  { name: 'an unknown function', as: 'alice', method: 'POST', path: '/rpc/nothing_here', body: {}, loose: true },
  { name: 'a function called with other arguments', as: 'alice', method: 'POST', path: '/rpc/add', body: { a: 1, c: 2 }, loose: true },
]
