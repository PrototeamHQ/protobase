type Control = { disabled?: boolean; getAttribute: (name: string) => string | null }
type Card<T extends Control> = { querySelectorAll: (selectors: string) => Iterable<T>; querySelector: (selectors: string) => T | null }

const enabled = (control: Control) => !control.disabled && control.getAttribute('aria-disabled') !== 'true'

// A card's first action it can take, else its title's link: a disabled button takes no focus
export const firstControl = <T extends Control>(card: Card<T>) =>
  [...card.querySelectorAll('button')].find(enabled) ?? card.querySelector('a')
