import { defineConfig } from '@protobase/config'

export default defineConfig({
  files: {
    providers: {
      private: { kind: 'local', dir: './data/files/private' },
      public: { kind: 'local', dir: './data/files/public', public: true },
      archive: { kind: 'local', dir: '/mnt/archive', retention: '30 days' },
    },
    retention: '1 day',
    // Makes the image variants and placeholders
    images: 'sharp',
  },
})
