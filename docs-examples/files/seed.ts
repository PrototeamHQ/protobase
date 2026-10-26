import { storeFile } from '@protobase/server'
import config from './protobase.config'

// A row then holds public:images/test.png
export const seedImage = (bytes: Uint8Array) => storeFile({ provider: 'public', path: 'images/test.png', body: bytes, files: config.files, env: process.env })
