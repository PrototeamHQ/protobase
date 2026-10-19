import { describe, expect, it } from 'vitest'
import { f, resource, type RelatedModel, type ResourceModel } from '@protobase/schema'
import { openErrors, relatedErrors } from './view-related'

const tasks = resource('tasks').table('tasks').fields({ id: f.integer(), title: f.text() }).primaryKey((r) => r.id)
const versions = resource('versions').table('versions').fields({ taskId: f.relation('tasks'), number: f.integer() }).primaryKey((r) => [r.taskId, r.number])
const dependencies = resource('task_dependencies')
  .table('task_dependencies')
  .fields({ id: f.integer(), taskId: f.relation('tasks').filterable(), dependsOnId: f.relation('tasks'), versionId: f.relation('versions'), reason: f.text() })
  .primaryKey((r) => r.id)

const models: Record<string, ResourceModel> = { tasks: tasks.toModel(), versions: versions.toModel(), task_dependencies: dependencies.toModel() }

const section = (open: string): RelatedModel => ({ kind: 'related', title: 'Depends on', resource: 'task_dependencies', field: 'taskId', open })

describe('openErrors', () => {
  it('accepts a relation to a resource with a single-column key, and nothing without an open', () => {
    expect(openErrors(section('dependsOnId'), models)).toEqual([])
    expect(openErrors({ kind: 'related', title: 'Depends on', resource: 'task_dependencies', field: 'taskId' }, models)).toEqual([])
  })

  it('names what is wrong with the relation a row opens', () => {
    expect(openErrors(section('nope'), models)).toEqual(['open: unknown field "nope" on task_dependencies'])
    expect(openErrors(section('reason'), models)).toEqual(['open: "reason" on task_dependencies is not a relation'])
    expect(openErrors(section('taskId'), models)).toEqual(['open: "taskId" is the field that matches this record'])
    expect(openErrors(section('versionId'), models)).toEqual(['open: versions has a composite key, so its records cannot be opened from "versionId"'])
    const { versions: _, ...withoutVersions } = models
    expect(openErrors(section('versionId'), withoutVersions)).toEqual(['open: unknown resource "versions"'])
  })

  it('is part of what is wrong with the section', () => {
    expect(relatedErrors(section('dependsOnId'), 'tasks', models)).toEqual([])
    expect(relatedErrors(section('reason'), 'tasks', models)).toEqual(['open: "reason" on task_dependencies is not a relation'])
  })
})

describe('from', () => {
  const owner = resource('questions')
    .table('questions')
    .fields({ id: f.integer(), task_id: f.relation('tasks'), other_id: f.relation('versions'), secret: f.text().sensitive(), year: f.integer(), label: f.text() })
    .primaryKey((r) => r.id)
  const links = resource('task_links')
    .table('task_links')
    .fields({ id: f.integer(), task_id: f.relation('tasks').filterable(), kind: f.text().filterable() })
    .primaryKey((r) => r.id)
  const all: Record<string, ResourceModel> = { ...models, questions: owner.toModel(), task_links: links.toModel() }
  const pr = (o: Partial<RelatedModel>): RelatedModel => ({ kind: 'related', title: 'Pull requests', resource: 'task_links', field: 'task_id', from: 'task_id', filter: 'kind = "pr"', ...o })

  it("accepts a section listing the records sharing the record's task", () => {
    expect(relatedErrors(pr({}), 'questions', all)).toEqual([])
  })

  it('refuses the same section without from', () => {
    expect(relatedErrors(pr({ from: undefined }), 'questions', all)).toEqual(['"task_id" on task_links is not a relation to questions'])
  })

  it('names what is wrong with from', () => {
    expect(relatedErrors(pr({ from: 'nope' }), 'questions', all)).toEqual(['from: unknown field "nope" on questions'])
    expect(relatedErrors(pr({ from: 'secret' }), 'questions', all)).toEqual(['from: "secret" on questions is sensitive'])
    expect(relatedErrors(pr({ from: 'year' }), 'questions', all)).toEqual(['from: "year" on questions and "task_id" on task_links do not hold the same kind of value'])
    expect(relatedErrors(pr({ from: 'other_id' }), 'questions', all)).toEqual(['from: "other_id" on questions and "task_id" on task_links do not hold the same kind of value'])
    expect(relatedErrors(pr({ through: { resource: 'task_dependencies', field: 'taskId' } }), 'questions', all)).toEqual(['from and through cannot be combined'])
  })
})
