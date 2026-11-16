import { describe, expect, it } from 'vitest'
import { f, resource } from '@protobase/schema'
import { captureFileIssues } from './capture-files'
import { normalisedSql } from './migration-sql'

const notes = resource('notes').table('notes').fields({ id: f.integer(), body: f.text() }).primaryKey((r) => r.id).events((e) => e.crud())
const tasks = resource('tasks').table('tasks').fields({ id: f.integer() }).primaryKey((r) => r.id).history()

const table = 'create table notes (id integer primary key, body text not null);'
const setup = 'create schema if not exists "changes"; create table if not exists "changes"."outbox" (id bigint); create or replace function "changes"."capture"() returns trigger language plpgsql as $$ begin return null; end $$;'
const triggers = `create trigger "notes_changes" after insert or delete on "notes" for each row execute function "changes"."capture"('notes');
create trigger "notes_changes_update" after update on "notes" for each row when (old.* is distinct from new.*) execute function "changes"."capture"('notes');`

describe('the change capture judged from the migrations', () => {
  it("fails a resource with events whose migrations create its table but not its triggers, with the server's message", () => {
    const { issues, unjudged } = captureFileIssues([notes.toModel()], undefined, normalisedSql(`${table} ${setup}`))
    expect(issues).toEqual([{ severity: 'error', resource: 'notes', message: expect.stringContaining('The changes of notes are not captured as their events, history or live updates need') }])
    expect(unjudged).toEqual([])
  })

  it('passes once the triggers and the capture function are there', () => {
    expect(captureFileIssues([notes.toModel()], undefined, normalisedSql(`${table} ${setup} ${triggers}`)).issues).toEqual([])
    expect(captureFileIssues([notes.toModel()], undefined, normalisedSql(`${table} ${triggers}`)).issues).toHaveLength(1)
  })

  it('needs the history table for history, and leaves a resource whose table no migration creates to the database', () => {
    const sql = normalisedSql(`${setup} create table tasks (id integer primary key); create trigger tasks_changes after insert or delete on tasks for each row execute function changes.capture(); create trigger tasks_changes_update after update on tasks for each row execute function changes.capture();`)
    expect(captureFileIssues([tasks.toModel(), notes.toModel()], undefined, sql)).toEqual({ issues: [expect.objectContaining({ resource: 'tasks' })], unjudged: ['notes'] })
    expect(captureFileIssues([tasks.toModel()], undefined, `${sql} ${normalisedSql('create table if not exists "changes"."history" (id bigint);')}`).issues).toEqual([])
  })

  it('looks in the schema the events options name', () => {
    const sql = normalisedSql(`${table} ${setup.replaceAll('"changes"', '"audit"')} ${triggers.replaceAll('"changes"', '"audit"')}`)
    expect(captureFileIssues([notes.toModel()], { schema: 'audit' }, sql).issues).toEqual([])
    expect(captureFileIssues([notes.toModel()], undefined, sql).issues).toHaveLength(1)
  })
})
