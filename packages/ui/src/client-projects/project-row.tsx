import { Globe2, MapPin } from 'lucide-react'
import { userById } from '../mocks'
import { AvatarStack } from '../primitives/avatar'
import { Badge, type BadgeTone } from '../primitives/badge'
import type { ClientProject } from './projects'

const planTones: Record<ClientProject['plan'], BadgeTone> = { Starter: 'neutral', Team: 'blue', Business: 'violet' }

export const ProjectRow = ({ project }: { project: ClientProject }) => (
  <li className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.8fr)_150px_110px_minmax(0,1fr)_110px_100px] items-center gap-4 border-b px-5 py-4 last:border-b-0 hover:bg-surface">
    <div className="flex items-center gap-3">
      <span className="flex size-9 items-center justify-center rounded-md bg-muted text-[13px] font-semibold text-muted-foreground">{project.name[0]}</span>
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold">{project.name}</div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`size-1.5 rounded-full ${project.health === 'healthy' ? 'bg-success' : 'bg-warning'}`} />
          {project.health === 'healthy' ? 'All systems normal' : 'Degraded'}
        </div>
      </div>
    </div>
    <div className="flex items-center gap-2 truncate font-mono text-xs text-muted-foreground">
      <Globe2 className="size-3.5 shrink-0" />
      <span className="truncate">{project.domain}</span>
    </div>
    <div className="flex items-center gap-1.5 text-[13px]">
      <MapPin className="size-3.5 text-faint-foreground" />
      <span className="font-medium">{project.region}</span>
      <span className="text-muted-foreground">{project.location}</span>
    </div>
    <Badge tone={planTones[project.plan]} dot={false}>
      {project.plan}
    </Badge>
    <div className="truncate text-xs text-muted-foreground">{project.database}</div>
    <AvatarStack people={project.members.map(userById)} />
    <div className="text-right text-xs text-muted-foreground">{project.lastDeploy}</div>
  </li>
)
