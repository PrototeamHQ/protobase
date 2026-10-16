import sharp from 'sharp'
import * as config from './config'
import { mapLayers } from './config/map-layers'
import { roles } from './config/roles'
import { auth, authenticate } from './auth/auth'
import * as jobs from './jobs'

// sharp makes the listing photos' variants and placeholders; the maps draw PROTOBASE_MAP_STYLE_URL and switch to aerial photos.
export default { config, auth, authenticate, jobs, files: { sharp }, options: { roles, maps: { layers: mapLayers } } }
