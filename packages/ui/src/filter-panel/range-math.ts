/** Which histogram bars lie inside the selected range, for tinting. */
export const barInRange = (barIndex: number, bars: number, min: number, max: number, selected: [number, number]) => {
  const barStart = min + ((max - min) * barIndex) / bars
  const barEnd = min + ((max - min) * (barIndex + 1)) / bars
  return barEnd > selected[0] && barStart < selected[1]
}

export const fraction = (value: number, min: number, max: number) => (max === min ? 0 : (value - min) / (max - min))

/** Keeps the two thumbs ordered, moving the one being dragged. */
export const moveThumb = (range: [number, number], thumb: 0 | 1, value: number): [number, number] =>
  thumb === 0 ? [Math.min(value, range[1]), range[1]] : [range[0], Math.max(value, range[0])]
