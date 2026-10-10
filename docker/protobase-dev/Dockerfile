# protobase-dev: Bun and the presets at /opt/protobase/presets/<name>, with one node_modules that fits every preset
# installed in /workspace. Copy a preset there and `bun install --frozen-lockfile` has nothing to do; installed
# anywhere else, a preset comes from Bun's cache in /opt/bun-cache, without the network. There is no Node: the presets'
# scripts and the protobase CLI run on Bun.
# Context: dist/images/protobase-dev (bun run images:context).
ARG BUN_VERSION=1.4.2
FROM oven/bun:${BUN_VERSION}
LABEL org.opencontainers.image.source=https://github.com/PrototeamHQ/protobase
LABEL org.opencontainers.image.description="Bun and the Protobase presets, with their dependencies installed"
LABEL org.opencontainers.image.licenses=Apache-2.0
COPY presets /opt/protobase/presets
RUN chmod -R a+rX /opt/protobase

# Every preset declares the same dependencies, so one install fits them all. It runs at build time, so the cache and
# node_modules land in one layer, hardlinked: installed in a container, overlayfs would first copy the whole cache up
# into that container's layer.
ENV BUN_INSTALL_CACHE_DIR=/opt/bun-cache
WORKDIR /workspace
RUN cp /opt/protobase/presets/erp/package.json /opt/protobase/presets/erp/bun.lock . \
  && bun install --frozen-lockfile --ignore-scripts --silent \
  && rm -rf /opt/bun-cache/.tmp \
  && chown -R bun:bun /opt/bun-cache /workspace
USER bun
