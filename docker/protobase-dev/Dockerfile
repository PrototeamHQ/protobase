# protobase-dev: Bun, the `protobase` command of the release installed globally, and the presets at
# /opt/protobase/presets/<name>, with one node_modules that fits every preset installed in /workspace. Copy a preset
# there and `bun install --frozen-lockfile` has nothing to do; installed anywhere else, a preset comes from Bun's cache in
# /opt/bun-cache, without the network. The global CLI builds a bundled project with nothing installed and hands a
# locked one over to its own. There is no Node: the presets' scripts and the protobase CLI run on Bun.
# Context: dist/images/protobase-dev (bun run images:context); PROTOBASE_VERSION is the release's version.
ARG BUN_VERSION=1.4.4
FROM oven/bun:${BUN_VERSION}
ARG PROTOBASE_VERSION
LABEL org.opencontainers.image.source=https://github.com/PrototeamHQ/protobase
LABEL org.opencontainers.image.description="Bun and the Protobase presets, with their dependencies installed"
LABEL org.opencontainers.image.licenses=Apache-2.0
COPY presets /opt/protobase/presets
RUN chmod -R a+rX /opt/protobase

# Every preset declares the same dependencies, so one install fits them all, and the global CLI is the same packages
# again. It runs at build time, so the cache and both installs land in one layer, hardlinked: installed in a container,
# overlayfs would first copy the whole cache up into that container's layer.
ENV BUN_INSTALL_CACHE_DIR=/opt/bun-cache BUN_INSTALL_GLOBAL_DIR=/opt/protobase/cli
WORKDIR /workspace
RUN test -n "$PROTOBASE_VERSION" \
  && cp /opt/protobase/presets/erp/package.json /opt/protobase/presets/erp/bun.lock . \
  && bun install --frozen-lockfile --ignore-scripts --silent \
  && bun add --global --silent "@protobase/cli@$PROTOBASE_VERSION" \
  && rm -rf /opt/bun-cache/.tmp \
  && chown -R bun:bun /opt/bun-cache /workspace
USER bun
