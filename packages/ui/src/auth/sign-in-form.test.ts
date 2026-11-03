import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SignInForm, type SignInFormProps } from './sign-in-form'

const render = (props: Partial<SignInFormProps>) => renderToStaticMarkup(createElement(SignInForm, { onSubmit: () => {}, ...props }))

describe('SignInForm', () => {
  it("names the app in its title, and Protobase for an app that names itself nothing", () => {
    expect(render({ appName: 'Shop & Co' })).toContain('<h1 class="mt-4 text-xl font-semibold tracking-tight short:mt-0">Sign in to Shop &amp; Co</h1>')
    expect(render({})).toContain('>Sign in to Protobase</h1>')
  })

  it('ends on the Runs on Protobase note, below the form, only when the host turns it on', () => {
    const html = render({ appName: 'Shop & Co', runsOnNote: true })
    expect(html.match(/Runs on Protobase/g)).toHaveLength(1)
    expect(html).toMatch(/<\/form>.*<footer[^>]*><a href="https:\/\/protobase.net\/" rel="nofollow noreferrer"[^>]*>Runs on Protobase<\/a><\/footer>/)
    expect(render({ appName: 'Shop & Co' })).not.toContain('Runs on Protobase')
  })
})
