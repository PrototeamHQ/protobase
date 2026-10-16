/** Whether a drag closes a sheet: mostly downwards, by 60 pixels or more. */
export const closesSheet = (dx: number, dy: number) => dy >= 60 && dy > Math.abs(dx)
