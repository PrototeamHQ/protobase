import { Kysely } from 'kysely'
import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { userTablesMigration } from '@protobase/server'
import { userTableModels } from '../../src/doctor/user-table-models'
import { openSnapshotDb } from '../../../../test-support/sql-snapshot'

const orders = resource('orders').table('orders').fields({ id: f.integer(), amount: f.integer() }).primaryKey((r) => r.id).toModel()

describe('doctor on the tables users add', () => {
  it('reports a definition whose column is missing as an error, and one a resource in code takes over, and checks the rest', async () => {
    const pg = await openSnapshotDb('empty')
    const db = new Kysely<any>({ dialect: pg.dialect })
    await pg.exec((await userTablesMigration(db))!)
    await pg.exec(`
      create table user_tables.notes (id bigint generated always as identity primary key, title text not null);
      create table user_tables.tasks (id bigint generated always as identity primary key, title text not null);
      create table user_tables.orders (id bigint generated always as identity primary key);
      insert into table_definitions.tables (name, singular_label, plural_label, title_field, version) values
        ('notes', 'Note', 'Notes', 'title', 1), ('tasks', 'Task', 'Tasks', null, 1), ('orders', 'Order', 'Orders', null, 1);
      insert into table_definitions.fields (table_id, name, label, type, required, position) values
        (1, 'title', 'Title', 'text', true, 1), (2, 'title', 'Title', 'text', true, 1), (2, 'due', 'Due', 'date', false, 2);
    `)
    const found = await userTableModels(db, [orders])
    await db.destroy()
    expect(found.models.map((model) => model.name)).toEqual(['notes'])
    expect(found.issues).toEqual([
      { severity: 'error', resource: 'user tables', message: 'The user table "tasks" is not served: the column "due" does not exist.' },
      { severity: 'warning', resource: 'orders', message: 'a resource in code has the name of this user table, which is not served' },
    ])
  })
})
