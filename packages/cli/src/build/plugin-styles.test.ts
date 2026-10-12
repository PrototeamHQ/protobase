import { describe, expect, it } from 'vitest'
import { classNames, hasVariant, layerPluginUtilities } from './plugin-styles'

describe('hasVariant', () => {
  it('tells utilities with a variant from those without, arbitrary values included', () => {
    for (const name of ['md:flex', 'hover:bg-muted', 'max-sm:hidden', '[&>*]:p-2', 'data-[state=open]:block', 'group-hover:underline', 'dark:md:hidden']) expect(hasVariant(name)).toBe(true)
    for (const name of ['flex', 'bg-primary/70', '[mask-type:luminance]', 'w-[calc(100%-1rem)]', '!hidden', '-mt-2']) expect(hasVariant(name)).toBe(false)
  })
})

describe('classNames', () => {
  it('reads the unescaped class names of a selector, inside :is() and :where() too', () => {
    expect(classNames('.md\\:flex')).toEqual(['md:flex'])
    expect(classNames('.space-y-2>:not(:last-child)')).toEqual(['space-y-2'])
    expect(classNames('.group-hover\\:underline:is(:where(.group):hover *)')).toEqual(['group-hover:underline', 'group'])
    expect(classNames(':is(.\\*\\:p-2>*)')).toEqual(['*:p-2'])
    expect(classNames('.\\32 xl\\:block')).toEqual(['2xl:block'])
    expect(classNames('.bg-primary\\/70')).toEqual(['bg-primary/70'])
  })
})

describe('layerPluginUtilities', () => {
  it("moves the utilities without a variant into a layer under the app's, keeping the variants after the app's", () => {
    const css = '@layer theme,base,components;@layer utilities{.flex{display:flex}.hidden{display:none}.space-y-2>:not(:last-child){margin:0}@media (min-width:48rem){.md\\:flex{display:flex}}.hover\\:underline:hover{text-decoration:underline}}@property --tw-x{syntax:"*";inherits:false}'
    expect(layerPluginUtilities(css)).toBe(
      '@layer theme,base,components;@layer utilities{@layer plugin{.flex{display:flex}.hidden{display:none}.space-y-2>:not(:last-child){margin:0}}@media (min-width:48rem){.md\\:flex{display:flex}}.hover\\:underline:hover{text-decoration:underline}}@property --tw-x{syntax:"*";inherits:false}',
    )
  })

  it('splits a rule and a grouping rule that hold both', () => {
    const css = '@layer utilities{.underline,.hover\\:underline:hover{text-decoration:underline}@supports (color:color-mix(in lab,red,red)){.bg-x\\/70{color:red}.hover\\:bg-x\\/70:hover{color:red}}}'
    expect(layerPluginUtilities(css)).toBe(
      '@layer utilities{@layer plugin{.underline{text-decoration:underline}@supports (color:color-mix(in lab,red,red)){.bg-x\\/70{color:red}}}.hover\\:underline:hover{text-decoration:underline}@supports (color:color-mix(in lab,red,red)){.hover\\:bg-x\\/70:hover{color:red}}}',
    )
  })

  it('leaves a stylesheet without utilities or without plain utilities as it is', () => {
    expect(layerPluginUtilities('@layer theme,base,components;')).toBe('@layer theme,base,components;')
    expect(layerPluginUtilities('@layer utilities{@media (min-width:48rem){.md\\:flex{display:flex}}}')).toBe('@layer utilities{@media (min-width:48rem){.md\\:flex{display:flex}}}')
  })
})
