// The site's llms.txt (https://llmstxt.org): what Protobase is, the protobase agent skill, and every hand-written page
// in the sidebar's order as a link to its Markdown, with its description.
const origin = 'https://docs.protobase.net'

export const skillPath = '/skills/protobase/SKILL.md'

interface Section {
  title: string
  pages: { path: string; title: string; description?: string }[]
}

export function llmsTxt({ description, sections }: { description: string; sections: Section[] }) {
  const lines = [
    '# Protobase',
    '',
    `> ${description}`,
    '',
    'Every page below is Markdown at its address plus `.md`. The protobase agent skill is the everyday workflow, the checks before calling a change done, and these pages as files it points to; in a project, `npx protobase skill install` writes the skill of the installed version.',
    '',
    '## Agent skill',
    '',
    `- [protobase skill](${origin}${skillPath}): Build, check and ship a Protobase admin app on Postgres.`,
  ]
  for (const section of sections) {
    lines.push('', `## ${section.title}`, '')
    for (const page of section.pages) lines.push(`- [${page.title}](${origin}/${page.path}.md)${page.description ? `: ${page.description}` : ''}`)
  }
  return `${lines.join('\n')}\n`
}
