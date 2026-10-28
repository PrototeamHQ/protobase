import type { ResourceModel } from '@protobase/schema'
import { useRelationTitle } from './use-relation-title'

/** The name of the record `id` of `target` a relation points at, for the reader; its key while the name loads. */
export const RelationTitleText = ({ target, id }: { target: ResourceModel; id: string }) => <>{useRelationTitle(target, id) ?? id}</>
