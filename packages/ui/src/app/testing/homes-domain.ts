import { f, l, resource, view, type RecordMode } from '@protobase/schema'

// A home for sale with its photos, for the record page's read view, its Edit switch, its key facts, its gallery and
// lightbox: the stories show it to an admin who may change it and read its photos' records, and to a visitor who may do
// neither.

const homes = resource('homes')
  .table('homes')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    title: f.text(),
    price: f.decimal({ precision: 12, scale: 2 }).optional(),
    bedrooms: f.integer().optional(),
    energy_label: f.enum(['a', 'b', 'c', 'd']).optional(),
    garden: f.boolean(),
    description: f.text().optional(),
    agent_phone: f.text().optional(),
    cover: f.file().accept(['image/*']).optional(),
  })
  .primaryKey((r) => r.id)

const homePhotos = resource('home_photos')
  .table('home_photos')
  .fields({
    id: f.integer().readOnly().filterable().sortable(),
    home_id: f.relation('homes').filterable().sortable(),
    position: f.integer().sortable(),
    photo: f.file().accept(['image/*']),
    caption: f.text().optional(),
  })
  .primaryKey((r) => r.id)

/**
 * The view of a home whose record page opens as `mode` says, its first section as key facts with `facts`; with `split`
 * its bedrooms show only on the read view, and its cover and photo list only on the form.
 */
const homesView = (mode: RecordMode, facts: boolean, split: boolean, conditional: boolean) =>
  view<typeof homes>('homes')
    .names({ singular: 'Home', plural: 'Homes' })
    .title((r) => r.title)
    .recordMode(mode)
    .helpWhen('editing')
    .fields((r) => ({
      title: r.title.label('Address'),
      price: r.price.label('Asking price').prefix('€').decimals(0).help('Without the buyer\'s costs.').icon('tag'),
      bedrooms: split ? r.bedrooms.icon('bed').when('reading') : r.bedrooms.icon('bed'),
      energy_label: r.energy_label.label('Energy label').format('badge').icon('leaf'),
      description: r.description.multiline(),
      agent_phone: r.agent_phone.label('Agent phone').help('Call to plan a viewing.', { when: 'always' }),
      cover: r.cover.label('Cover photo'),
    }))
    .list((r) => ({ columns: [r.title, r.price] }))
    .layout((r) => [
      l.gallery('Photos', { image: r.cover, photos: { resource: 'home_photos', field: 'home_id', image: 'photo', sort: 'position' } }),
      l.section('Home', [r.title, r.price, r.bedrooms, r.energy_label, r.garden], { help: 'As the seller states it.', ...(facts && { presentation: 'facts' as const }) }),
      l.section('About', [r.description]),
      l.section('Viewing', [r.agent_phone], { help: 'The agent shows the home.', helpWhen: 'always' }),
      ...(conditional
        ? [
            l.section('Garden notes', [r.description], { when: 'garden = true' }),
            l.section('No garden notes', [r.agent_phone], { when: 'garden = false' }),
            l.sidebar([r.energy_label], { when: 'garden = false' }),
            l.related('Photos kept', { resource: 'home_photos', field: 'home_id', columns: ['caption'], hideEmpty: true }),
          ]
        : []),
      ...(split ? [l.section('Cover', [r.cover], { when: 'editing' }), l.related('Photo list', { resource: 'home_photos', field: 'home_id', columns: ['caption'], when: 'editing' })] : []),
    ])

const homePhotosView = view<typeof homePhotos>('home_photos')
  .names({ singular: 'Photo', plural: 'Photos' })
  .fields((r) => ({ home_id: r.home_id.label('Home') }))
  .layout((r) => [l.section('Photo', [r.caption, r.position, r.photo])])

export const homeResources = [homes.toModel(), homePhotos.toModel()]

export const homeViews = (mode: RecordMode, { facts = false, split = false, conditional = false } = {}) => [homesView(mode, facts, split, conditional).toModel(homes.toModel()), homePhotosView.toModel(homePhotos.toModel())]

// A photo stand-in: a sky and a ground in its own colour, drawn as a PNG.
const picture = (hue: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 240
  const context = canvas.getContext('2d')!
  context.fillStyle = `hsl(${hue} 60% 80%)`
  context.fillRect(0, 0, 320, 240)
  context.fillStyle = `hsl(${hue} 45% 45%)`
  context.fillRect(0, 160, 320, 80)
  return canvas.toDataURL('image/png')
}

const photo = (name: string, hue: number) => ({ uri: `public:homes/${name}.png`, name: `${name}.png`, type: 'image/png', size: 4096, url: picture(hue) })

const front = photo('front', 210)
const captions = ['Front', 'Living room', 'Kitchen', 'Garden', 'Bedroom', 'Bathroom', 'Attic', 'Street']

/** The rows: a home with a cover and eight photos, the cover first among them, and a home without photos. */
export const homeRows = () => ({
  homes: [
    { id: 1, title: 'Keizersgracht 120', price: '650000.00', bedrooms: 3, energy_label: 'b', garden: true, description: 'A canal house on three floors.\nThe garden faces south.', agent_phone: '+31 20 555 0101', cover: front },
    { id: 2, title: 'Oudegracht 7', price: null, bedrooms: null, energy_label: null, garden: false, description: null, agent_phone: null, cover: null },
  ],
  home_photos: captions.map((caption, index) => ({ id: 11 + index, home_id: 1, position: index + 1, photo: index === 0 ? front : photo(caption.toLowerCase().replace(' ', '-'), 30 + index * 40), caption })),
})
