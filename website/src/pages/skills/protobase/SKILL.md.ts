// The protobase agent skill at a fixed URL, https://docs.protobase.net/skills/protobase/SKILL.md, as committed in the
// repository (scripts/protobase-skill.ts writes it from these docs, and CI fails when it falls behind them).
import type { APIRoute } from 'astro'
import skill from '../../../../../skills/protobase/SKILL.md?raw'

export const GET: APIRoute = () => new Response(skill, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
