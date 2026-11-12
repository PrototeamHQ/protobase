import type { ResourceModel } from '@protobase/schema'

/**
 * Stops startup, before any capture is set up, on a `.live({ reads })` naming a name that is not a resource or another
 * resource backed by a view. A view takes no trigger, so a view's changes come only from the tables it reads: a reader
 * names those, and no reader reads another reader.
 */
export const checkLiveReads = (models: readonly ResourceModel[]) => {
  for (const model of models) {
    const unknown = (model.liveReads ?? []).filter((read) => !models.some((candidate) => candidate.name === read))
    if (unknown.length > 0) throw new Error(`Resource "${model.name}" is live from "${unknown.join('", "')}", which is not a resource`)
    const views = (model.liveReads ?? []).filter((read) => models.some((candidate) => candidate.name === read && candidate.liveReads))
    if (views.length > 0) throw new Error(`Resource "${model.name}" is live from "${views.join('", "')}", which is live from other resources itself: name the resources it reads instead`)
  }
}
