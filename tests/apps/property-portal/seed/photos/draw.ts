import { createCanvas, type Canvas, type Rgb } from './canvas'
import { pick, rngAt, type Rand } from '../rng'

export const photoWidth = 640
export const photoHeight = 480

const bricks: Rgb[] = [[150, 72, 52], [120, 60, 46], [176, 98, 66], [98, 52, 44], [160, 120, 90]]
const plaster: Rgb[] = [[244, 238, 226], [236, 220, 196], [250, 246, 240], [226, 206, 170], [214, 222, 226]]
const roofs: Rgb[] = [[70, 62, 60], [128, 58, 42], [96, 96, 104], [150, 76, 50]]
const doors: Rgb[] = [[34, 70, 54], [30, 50, 96], [120, 30, 34], [60, 40, 30]]
const glass: Rgb = [176, 206, 226]
const frame: Rgb = [250, 250, 248]

const sky = (c: Canvas, rand: Rand) => {
  const sunny = rand() < 0.6
  c.gradient(0, 340, sunny ? [92, 156, 222] : [150, 170, 190], sunny ? [196, 224, 246] : [214, 222, 230])
}

const ground = (c: Canvas, color: Rgb) => c.rect(0, 340, c.width, 140, color)

const window = (c: Canvas, x: number, y: number, w: number, h: number) => {
  c.rect(x - 3, y - 3, w + 6, h + 6, frame)
  c.rect(x, y, w, h, glass)
  c.rect(x + w / 2 - 1, y, 2, h, frame)
}

const tree = (c: Canvas, x: number, rand: Rand) => {
  c.rect(x - 5, 260, 10, 85, [92, 64, 40])
  const leaves: Rgb = pick(rand, [[64, 120, 60], [84, 140, 64], [52, 104, 70]])
  c.circle(x, 240, 38, leaves)
  c.circle(x - 24, 262, 26, leaves)
  c.circle(x + 24, 262, 26, leaves)
}

// A tall block of flats, its windows in a grid.
const apartment = (c: Canvas, rand: Rand) => {
  const wall = pick(rand, [...bricks, ...plaster])
  const floors = 4 + Math.floor(rand() * 3)
  const top = 340 - floors * 52
  c.rect(130, top, 380, floors * 52, wall)
  for (let floor = 0; floor < floors; floor++) {
    for (let col = 0; col < 5; col++) window(c, 152 + col * 72, top + 12 + floor * 52, 44, 30)
    if (rand() < 0.5) c.rect(140, top + 46 + floor * 52, 360, 4, [80, 80, 84])
  }
  c.rect(298, 300, 44, 40, pick(rand, doors))
}

// A house with a pitched roof, a door and windows, and a tree beside it.
const house = (c: Canvas, rand: Rand) => {
  const wall = pick(rand, [...bricks, ...plaster])
  c.rect(170, 210, 300, 130, wall)
  c.polygon([[150, 212], [320, 110], [490, 212]], pick(rand, roofs))
  window(c, 200, 240, 70, 50)
  window(c, 370, 240, 70, 50)
  window(c, 296, 150, 48, 38)
  c.rect(298, 280, 44, 60, pick(rand, doors))
  tree(c, 560, rand)
  if (rand() < 0.5) tree(c, 80, rand)
}

// A row of narrow Dutch houses with stepped and bell gables.
const townhouse = (c: Canvas, rand: Rand) => {
  for (let i = 0; i < 4; i++) {
    const x = 60 + i * 130
    const height = 190 + Math.floor(rand() * 40)
    const top = 340 - height
    const wall = pick(rand, bricks)
    c.rect(x, top, 124, height, wall)
    if (rand() < 0.5) {
      c.polygon([[x, top + 1], [x + 20, top + 1], [x + 20, top - 18], [x + 42, top - 18], [x + 42, top - 36], [x + 82, top - 36], [x + 82, top - 18], [x + 104, top - 18], [x + 104, top + 1], [x + 124, top + 1]], wall)
    } else {
      c.polygon([[x + 10, top + 1], [x + 40, top - 30], [x + 84, top - 30], [x + 114, top + 1]], wall)
      c.rect(x + 40, top - 34, 44, 6, frame)
    }
    for (let floor = 0; floor < Math.floor(height / 60); floor++) {
      window(c, x + 18, top + 16 + floor * 58, 36, 38)
      window(c, x + 70, top + 16 + floor * 58, 36, 38)
    }
    c.rect(x + 44, 300, 36, 40, pick(rand, doors))
  }
}

// A wide white villa with a flat roof, large windows and a pool in front.
const villa = (c: Canvas, rand: Rand) => {
  const wall = pick(rand, plaster)
  c.rect(90, 220, 460, 120, wall)
  c.rect(250, 160, 220, 62, wall)
  c.rect(80, 214, 480, 8, [200, 196, 190])
  window(c, 120, 250, 110, 70)
  window(c, 400, 250, 120, 70)
  window(c, 280, 176, 160, 34)
  c.rect(270, 270, 70, 70, [120, 90, 60])
  c.rect(140, 380, 360, 60, [64, 164, 214])
  c.rect(140, 380, 360, 6, [236, 236, 230])
  if (rand() < 0.7) {
    c.rect(588, 230, 8, 112, [120, 92, 60])
    c.polygon([[592, 230], [552, 250], [592, 238], [632, 250]], [70, 130, 70])
  }
}

// A small building with one large window: a studio.
const studio = (c: Canvas, rand: Rand) => {
  c.rect(200, 180, 240, 160, pick(rand, [...plaster, ...bricks]))
  window(c, 236, 214, 168, 80)
  c.rect(300, 300, 40, 40, pick(rand, doors))
  tree(c, 520, rand)
}

// A building whose top floor is a glass penthouse with a terrace.
const penthouse = (c: Canvas, rand: Rand) => {
  apartment(c, rand)
  c.rect(160, 92, 320, 4, [70, 70, 74])
  c.rect(210, 40, 220, 52, glass)
  for (let x = 210; x <= 430; x += 44) c.rect(x, 40, 3, 52, frame)
  for (let x = 160; x <= 480; x += 16) c.rect(x, 78, 2, 14, [70, 70, 74])
}

const exteriors = { apartment, house, townhouse, villa, studio, penthouse }

export type PropertyType = keyof typeof exteriors

/** The outside of a home of a kind, one of a few variants per kind. */
export const drawExterior = (type: PropertyType, variant: number) => {
  const c = createCanvas(photoWidth, photoHeight)
  const rand = rngAt(9100 + Object.keys(exteriors).indexOf(type), variant)
  sky(c, rand)
  ground(c, type === 'villa' ? [214, 196, 160] : pick(rand, [[96, 150, 80], [120, 160, 90], [150, 150, 150]]))
  exteriors[type](c, rand)
  return c
}

const floorColors: Rgb[] = [[176, 136, 96], [196, 170, 140], [140, 104, 76], [214, 210, 204]]
const wallColors: Rgb[] = [[240, 236, 228], [226, 232, 236], [238, 226, 212], [220, 228, 216]]

const room = (c: Canvas, rand: Rand) => {
  c.rect(0, 0, c.width, 330, pick(rand, wallColors))
  c.rect(0, 330, c.width, 150, pick(rand, floorColors))
  c.rect(0, 326, c.width, 6, [250, 250, 250])
}

const rooms = {
  living: (c: Canvas, rand: Rand) => {
    room(c, rand)
    window(c, 380, 70, 200, 180)
    const sofa: Rgb = pick(rand, [[90, 110, 140], [150, 90, 70], [110, 120, 100], [70, 70, 80]])
    c.rect(60, 250, 260, 80, sofa)
    c.rect(60, 220, 260, 40, sofa)
    c.rect(120, 380, 160, 40, pick(rand, [[200, 170, 120], [180, 80, 70], [90, 120, 150]]))
    c.circle(500, 400, 34, [120, 92, 60])
  },
  kitchen: (c: Canvas, rand: Rand) => {
    room(c, rand)
    const units: Rgb = pick(rand, [[250, 250, 250], [60, 72, 80], [120, 140, 120], [210, 196, 170]])
    c.rect(40, 230, 560, 100, units)
    c.rect(40, 220, 560, 12, [60, 60, 64])
    c.rect(40, 60, 560, 90, units)
    for (let x = 40; x < 600; x += 112) c.rect(x, 230, 2, 100, [180, 180, 180])
    c.rect(260, 236, 120, 60, [40, 40, 44])
  },
  bedroom: (c: Canvas, rand: Rand) => {
    room(c, rand)
    window(c, 60, 80, 140, 150)
    c.rect(250, 260, 300, 120, [240, 240, 236])
    c.rect(250, 200, 300, 70, pick(rand, [[120, 90, 70], [80, 90, 110], [200, 190, 170]]))
    c.rect(270, 240, 110, 30, [250, 250, 250])
    c.rect(420, 240, 110, 30, [250, 250, 250])
    c.rect(250, 300, 300, 80, pick(rand, [[150, 170, 200], [210, 160, 150], [180, 200, 170]]))
  },
  bathroom: (c: Canvas, rand: Rand) => {
    c.rect(0, 0, c.width, c.height, pick(rand, [[236, 240, 242], [224, 230, 228], [242, 238, 232]]))
    for (let x = 0; x < c.width; x += 40) c.rect(x, 0, 1, 330, [200, 204, 208])
    for (let y = 0; y < 330; y += 40) c.rect(0, y, c.width, 1, [200, 204, 208])
    c.rect(0, 330, c.width, 150, [120, 124, 130])
    c.rect(60, 270, 300, 90, [252, 252, 252])
    c.rect(440, 220, 120, 20, [252, 252, 252])
    c.rect(470, 100, 60, 90, [190, 214, 230])
  },
  garden: (c: Canvas, rand: Rand) => {
    sky(c, rand)
    c.rect(0, 300, c.width, 180, [104, 160, 84])
    c.rect(0, 250, c.width, 56, [52, 96, 56])
    tree(c, 120, rand)
    tree(c, 500, rand)
    c.rect(250, 380, 140, 10, [160, 120, 80])
    c.rect(260, 340, 10, 50, [160, 120, 80])
    c.rect(370, 340, 10, 50, [160, 120, 80])
  },
}

export type RoomKind = keyof typeof rooms

/** A room inside a home, one of a few variants per kind. */
export const drawRoom = (kind: RoomKind, variant: number) => {
  const c = createCanvas(photoWidth, photoHeight)
  rooms[kind](c, rngAt(9200 + Object.keys(rooms).indexOf(kind), variant))
  return c
}

export const exteriorVariants = 6
export const roomVariants = 4
export const roomKinds = Object.keys(rooms) as RoomKind[]
export const propertyTypes = Object.keys(exteriors) as PropertyType[]
