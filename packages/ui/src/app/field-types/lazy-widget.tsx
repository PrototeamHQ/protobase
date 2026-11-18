import type { ComponentType } from 'react'
import { Skeleton } from '../../primitives/skeleton'
import { lazyComponent } from '../lazy-component'
import type { FieldWidget } from './field-widget'

/** What a field type is without its parts: the storage types it shows, whether it is wide, and which parts it has. */
export type WidgetShape = Pick<FieldWidget, 'of' | 'wide'> & { editor: boolean; cell: boolean }

/** A field type's shape, as `lazyWidget` takes it. */
export const shapeOf = (widget: FieldWidget): WidgetShape => ({ of: widget.of, ...(widget.wide && { wide: widget.wide }), editor: Boolean(widget.editor), cell: Boolean(widget.cell) })

/**
 * A field type whose parts load with the first one drawn, as a chunk of their own, from `load`, with a skeleton in their
 * place until then; `shape` says up front what it is, as the widget `load` gives says too.
 */
export const lazyWidget = ({ editor, cell, ...shape }: WidgetShape, load: () => Promise<FieldWidget>): FieldWidget => {
  const part = (pick: (widget: FieldWidget) => ComponentType<any> | undefined, skeleton: string) =>
    lazyComponent(
      () => load().then((widget) => pick(widget) ?? (() => null)),
      () => <Skeleton className={skeleton} />,
    )
  const block = shape.wide ? 'h-24 w-full' : 'h-4 w-24'
  return {
    ...shape,
    display: part((widget) => widget.display, block),
    ...(editor && { editor: part((widget) => widget.editor, block) }),
    ...(cell && { cell: part((widget) => widget.cell, 'h-3 w-16') }),
  }
}
