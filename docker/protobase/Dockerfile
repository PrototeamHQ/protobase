# protobase: the serve runtime, compiled with its bytecode into one executable, which serves the API of the
# bundle mounted at /app (`protobase build`'s dist/); Bun itself for the healthcheck; and the C++ runtime that native
# add-ons in a bundle's node_modules link (libstdc++, libgcc_s). Context: dist/images/protobase (bun run images:context).
ARG BUN_VERSION=1.4.2

# Built by the Bun the image runs, so its bytecode always matches. It never reads .env or bunfig.toml from its working
# directory, /app. It does read package.json files: without them a compiled Bun resolves a package in the bundle's
# node_modules only through an index.js, never through its "main" or "exports".
FROM oven/bun:${BUN_VERSION} AS build
COPY protobase-serve.js /build/protobase-serve.js
RUN bun build --compile --bytecode --format=esm --target=bun \
  --no-compile-autoload-dotenv --no-compile-autoload-bunfig --compile-autoload-package-json \
  --outfile /build/protobase-serve /build/protobase-serve.js

# Debian 13, as the distroless image: the libraries `protobase build` allows add-ons to link.
FROM debian:trixie-slim AS libs
RUN d=/usr/lib/$(uname -m)-linux-gnu && mkdir -p /out$d && cp -a $d/libstdc++.so.6* $d/libgcc_s.so.1 /out$d/

FROM oven/bun:${BUN_VERSION}-distroless
LABEL org.opencontainers.image.source=https://github.com/PrototeamHQ/protobase
LABEL org.opencontainers.image.description="Protobase's serve runtime: serves the API of the bundle mounted at /app"
LABEL org.opencontainers.image.licenses=Apache-2.0
COPY --from=libs /out/ /
COPY --from=build --chmod=0755 /build/protobase-serve /opt/protobase/protobase-serve
ENV NODE_ENV=production PORT=8787
WORKDIR /app
USER nonroot
EXPOSE 8787
HEALTHCHECK --start-period=60s --start-interval=1s CMD ["/usr/local/bin/bun", "--no-install", "-e", "const r = await fetch(`http://127.0.0.1:${process.env.PORT}/health`); process.exit(r.ok ? 0 : 1)"]
ENTRYPOINT ["/opt/protobase/protobase-serve"]
CMD ["/app/protobase.config.js"]
