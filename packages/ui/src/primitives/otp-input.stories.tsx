import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { OtpInput, type OtpInputProps } from './otp-input'

const meta = { title: 'Components/OtpInput', parameters: { layout: 'centered' } } satisfies Meta
export default meta

type Args = Pick<OtpInputProps, 'onComplete' | 'invalid' | 'disabled' | 'length'> & { initial?: string }

const Field = ({ initial = '', ...rest }: Args) => {
  const [code, setCode] = useState(initial)
  return (
    <label className="flex w-80 flex-col gap-1.5 font-medium">
      Code
      <OtpInput value={code} onChange={setCode} {...rest} />
    </label>
  )
}

const boxesOf = (canvasElement: HTMLElement) => [...canvasElement.querySelectorAll('[data-slot]')].map((box) => box.getAttribute('data-digit') ?? '')

// What the system's code autofill does: it sets the field's text and fires `input`, the code as the event's text when
// it inserts it at the caret (iOS's keyboard suggestion), or without it when it replaces the field (Chrome's autofill).
const autofill = (input: HTMLInputElement, text: string, inserted?: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text)
  input.dispatchEvent(inserted === undefined ? new Event('input', { bubbles: true }) : new InputEvent('input', { bubbles: true, inputType: 'insertText', data: inserted }))
}

/** A box per digit, one real field: typed digits fill the boxes, and the last one hands over the code. */
export const Typing: StoryObj<Args> = {
  tags: ['play'],
  args: { onComplete: fn() },
  render: (args) => <Field {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByLabelText('Code')
    expect(input).toHaveAttribute('autocomplete', 'one-time-code')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).not.toHaveAttribute('maxlength')
    await userEvent.type(input, '48a2')
    expect(boxesOf(canvasElement)).toEqual(['4', '8', '2', '', '', ''])
    expect(args.onComplete).not.toHaveBeenCalled()
    await userEvent.type(input, '9134')
    expect(input).toHaveValue('482913')
    expect(args.onComplete).toHaveBeenCalledOnce()
    expect(args.onComplete).toHaveBeenCalledWith('482913')
  },
}

/** A whole code pasted into any box replaces the field, from whatever text it came in. */
export const Pasting: StoryObj<Args> = {
  tags: ['play'],
  args: { onComplete: fn() },
  render: (args) => <Field {...args} />,
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByLabelText('Code')
    await userEvent.type(input, '12')
    await userEvent.paste('Your code: 482-913.')
    expect(input).toHaveValue('482913')
    expect(boxesOf(canvasElement)).toEqual(['4', '8', '2', '9', '1', '3'])
    expect(args.onComplete).toHaveBeenCalledOnce()
    expect(args.onComplete).toHaveBeenCalledWith('482913')
    // Fewer digits fill the boxes from the selected one.
    await userEvent.clear(input)
    await userEvent.type(input, '120056')
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}')
    await userEvent.paste('34')
    expect(input).toHaveValue('123456')
  },
}

/** The system's code autofill, from a mail or a text message, fills the boxes and hands over the code. */
export const Autofill: StoryObj<Args> = {
  tags: ['play'],
  args: { onComplete: fn() },
  render: (args) => <Field {...args} />,
  play: async ({ canvasElement, args }) => {
    const input = within(canvasElement).getByLabelText<HTMLInputElement>('Code')
    await userEvent.type(input, '12')
    autofill(input, '12135790', '135790')
    expect(input).toHaveValue('135790')
    expect(args.onComplete).toHaveBeenLastCalledWith('135790')
    await userEvent.clear(input)
    autofill(input, '246810')
    expect(input).toHaveValue('246810')
    expect(boxesOf(canvasElement)).toEqual(['2', '4', '6', '8', '1', '0'])
    expect(args.onComplete).toHaveBeenLastCalledWith('246810')
  },
}

/** Arrow keys, Home and End move between boxes, a digit typed on a filled box replaces it, and Backspace removes one. */
export const KeyboardNavigation: StoryObj<Args> = {
  tags: ['play'],
  args: { onComplete: fn() },
  render: (args) => <Field {...args} />,
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByLabelText('Code')
    await userEvent.type(input, '1234')
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}9')
    expect(input).toHaveValue('1294')
    await userEvent.keyboard('{Home}7')
    expect(input).toHaveValue('7294')
    await userEvent.keyboard('{End}{Backspace}{Backspace}')
    expect(input).toHaveValue('72')
  },
}

/** A refused code draws every box in the danger colour, and the field says it is invalid. */
export const Invalid: StoryObj<Args> = {
  tags: ['play'],
  args: { initial: '000000', invalid: true },
  render: (args) => <Field {...args} />,
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByLabelText('Code')).toHaveAttribute('aria-invalid', 'true')
  },
}

export const Disabled: StoryObj<Args> = {
  tags: ['play'],
  args: { initial: '4829', disabled: true },
  render: (args) => <Field {...args} />,
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByLabelText('Code')).toBeDisabled()
  },
}

/** Another length, such as a 4-digit code. */
export const FourDigits: StoryObj<Args> = {
  args: { length: 4, initial: '73' },
  render: (args) => <Field {...args} />,
}
