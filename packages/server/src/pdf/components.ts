import * as primitives from '@react-pdf/primitives'
import type * as ReactPdf from '@react-pdf/renderer'

// React PDF's components are the names its renderer knows its elements by, which `@react-pdf/primitives` holds without
// the renderer. They are typed as `@react-pdf/renderer` types them, so a document's JSX is checked the same.
const component = <Component>(name: string) => name as unknown as Component

export const Document = component<typeof ReactPdf.Document>(primitives.Document)
export const Page = component<typeof ReactPdf.Page>(primitives.Page)
export const View = component<typeof ReactPdf.View>(primitives.View)
export const Text = component<typeof ReactPdf.Text>(primitives.Text)
export const Link = component<typeof ReactPdf.Link>(primitives.Link)
export const Image = component<typeof ReactPdf.Image>(primitives.Image)
export const ImageBackground = component<typeof ReactPdf.ImageBackground>(primitives.ImageBackground)
export const Note = component<typeof ReactPdf.Note>(primitives.Note)
export const Canvas = component<typeof ReactPdf.Canvas>(primitives.Canvas)
export const FieldSet = component<typeof ReactPdf.FieldSet>(primitives.FieldSet)
export const TextInput = component<typeof ReactPdf.TextInput>(primitives.TextInput)
export const Checkbox = component<typeof ReactPdf.Checkbox>(primitives.Checkbox)
export const Select = component<typeof ReactPdf.Select>(primitives.Select)
export const List = component<typeof ReactPdf.List>(primitives.List)
export const Svg = component<typeof ReactPdf.Svg>(primitives.Svg)
export const G = component<typeof ReactPdf.G>(primitives.G)
export const Path = component<typeof ReactPdf.Path>(primitives.Path)
export const Rect = component<typeof ReactPdf.Rect>(primitives.Rect)
export const Line = component<typeof ReactPdf.Line>(primitives.Line)
export const Circle = component<typeof ReactPdf.Circle>(primitives.Circle)
export const Ellipse = component<typeof ReactPdf.Ellipse>(primitives.Ellipse)
export const Polygon = component<typeof ReactPdf.Polygon>(primitives.Polygon)
export const Polyline = component<typeof ReactPdf.Polyline>(primitives.Polyline)
export const Tspan = component<typeof ReactPdf.Tspan>(primitives.Tspan)
export const Defs = component<typeof ReactPdf.Defs>(primitives.Defs)
export const Stop = component<typeof ReactPdf.Stop>(primitives.Stop)
export const ClipPath = component<typeof ReactPdf.ClipPath>(primitives.ClipPath)
export const Marker = component<typeof ReactPdf.Marker>(primitives.Marker)
export const LinearGradient = component<typeof ReactPdf.LinearGradient>(primitives.LinearGradient)
export const RadialGradient = component<typeof ReactPdf.RadialGradient>(primitives.RadialGradient)

/** React PDF's `StyleSheet`: `create` gives back the styles it is given, typed as React PDF's styles. */
export const StyleSheet: typeof ReactPdf.StyleSheet = { create: (styles) => styles }
