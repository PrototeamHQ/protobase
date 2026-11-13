// The sample workflow a first run adds as the new admin, so the Workflows page has one to open, test-run and change.
export const sampleWorkflow = {
  name: 'Say hello',
  description: 'A sample: run it with an input such as {"name": "Ada"} and open the run to see each step.',
  definition: {
    trigger: { manual: {} },
    stateMachine: {
      QueryLanguage: 'JSONata',
      StartAt: 'Has a name?',
      States: {
        'Has a name?': {
          Type: 'Choice',
          Choices: [{ Condition: '{% $exists($states.context.Execution.Input.name) %}', Next: 'Greet' }],
          Default: 'Greet the world',
        },
        Greet: { Type: 'Pass', Output: { greeting: "{% 'Hello, ' & $states.context.Execution.Input.name & '!' %}" }, End: true },
        'Greet the world': { Type: 'Pass', Output: { greeting: 'Hello, world!' }, End: true },
      },
    },
  },
}

/** Signs in at `local`, where the app listens, as from `origin`, the app's address, and adds the sample. */
export const addSampleWorkflow = async (origin: string, local: string, email: string, password: string) => {
  const headers = { 'content-type': 'application/json', origin }
  const signIn = await fetch(`${local}/api/auth/sign-in/email`, { method: 'POST', headers, body: JSON.stringify({ email, password }) })
  if (!signIn.ok) throw new Error(`signing in to add the sample workflow answered ${signIn.status}`)
  const cookie = signIn.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
  const { token } = (await (await fetch(`${local}/api/auth/token`, { headers: { cookie, origin } })).json()) as { token: string }
  const created = await fetch(`${local}/api/v1/workflows`, { method: 'POST', headers: { ...headers, authorization: `Bearer ${token}` }, body: JSON.stringify(sampleWorkflow) })
  if (!created.ok) throw new Error(`adding the sample workflow answered ${created.status}: ${await created.text()}`)
}
