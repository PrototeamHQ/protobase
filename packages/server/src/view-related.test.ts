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
