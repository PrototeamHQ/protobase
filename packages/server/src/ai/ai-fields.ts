import type { ResourceModel, ViewModel } from '@protobase/schema'

/** The fields of a resource a job fills from a prompt (`.ai()`). */
export const aiFields = (model: ResourceModel) => Object.values(model.fields).filter((field) => field.ai)

/** Whether a resource has a field a job fills from a prompt. */
export const hasAiFields = (models: readonly ResourceModel[]) => models.some((model) => aiFields(model).length > 0)

/** Whether a view has an action that has the model write a field (`a.ai`). */
export const hasAiActions = (views: readonly ViewModel[]) => views.some((view) => view.actions.some((action) => action.run?.kind === 'ai'))
