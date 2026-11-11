import { HeadingCount } from '../record-view/heading-count'
import { useAdminMeta } from './meta-gate'
import { useRelatedCount, type CountedRelated } from './related-count'

/** How many records a group's related tables hold together, after its heading, named as their records when they are of one resource. */
export const GroupCount = ({ sections }: { sections: CountedRelated[] }) => {
  const count = useRelatedCount(sections)
  const { views } = useAdminMeta()
  const resources = new Set(sections.map(({ item }) => item.resource))
  const [only] = resources
  const names = resources.size === 1 ? views[only!]?.names : undefined
  return <HeadingCount count={count} names={names} />
}
