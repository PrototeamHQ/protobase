import { ChevronsUpDown, Plus } from 'lucide-react'
import { LogoMark } from '../app-shell'
import { Avatar } from '../primitives/avatar'
import { Button } from '../primitives/button'
import { ProjectRow } from './project-row'
import { clientProjects } from './projects'

const tabs = ['Projects', 'Domains', 'Team', 'Billing']

export const ClientProjects = () => (
  <div className="flex h-full flex-col bg-surface">
    <header className="flex h-12 items-center gap-6 border-b bg-background px-6">
      <div className="flex items-center gap-2.5">
        <LogoMark className="size-6" />
        <span className="text-[13px] font-semibold">Protobase Cloud</span>
        <span className="text-faint-foreground">/</span>
        <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
          Northlane Agency
          <ChevronsUpDown className="size-3.5" />
        </span>
      </div>
      <nav className="ml-6 flex gap-5 text-[13px]">
        {tabs.map((tab) => (
          <span key={tab} className={tab === 'Projects' ? 'font-medium' : 'text-muted-foreground'}>
            {tab}
          </span>
        ))}
      </nav>
      <div className="ml-auto">
        <Avatar initials="SM" hue={250} size="md" className="ring-0" />
      </div>
    </header>
    <main className="mx-auto w-full max-w-[1200px] flex-1 px-6 py-10">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Client projects</h1>
          <p className="text-[13px] text-muted-foreground">One admin panel per client, each on its own domain, in the region they choose.</p>
        </div>
        <Button variant="primary">
          <Plus className="size-3.5" />
          New project
        </Button>
      </div>
      <div className="mt-6 overflow-hidden rounded-lg border bg-background shadow-sm">
        <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1.8fr)_150px_110px_minmax(0,1fr)_110px_100px] gap-4 border-b bg-surface px-5 py-2.5 text-xs font-medium text-muted-foreground">
          <span>Project</span>
          <span>Domain</span>
          <span>Region</span>
          <span>Plan</span>
          <span>Database</span>
          <span>Members</span>
          <span className="text-right">Last deploy</span>
        </div>
        <ul>
          {clientProjects.map((project) => (
            <ProjectRow key={project.id} project={project} />
          ))}
        </ul>
      </div>
    </main>
  </div>
)
