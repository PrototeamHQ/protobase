import { defineConfig, localFiles } from '@protobase/server'
import * as config from './config'

export default defineConfig({
  config,
  files: {
    providers: {
      private: localFiles({ dir: './data/files/private' }),
      public: localFiles({ dir: './data/files/public', public: true }),
      archive: localFiles({ dir: '/mnt/archive', retention: '30 days' }),
    },
    retention: '1 day',
  },
})
