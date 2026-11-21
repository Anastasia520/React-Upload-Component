# Dev image only: the source is bind-mounted by docker-compose.yml, so nothing is copied in.
FROM node:20-bookworm-slim

WORKDIR /app

# Pre-create node_modules owned by `node` so the named volume mounted there inherits that ownership.
RUN mkdir -p /app/node_modules && chown -R node:node /app

USER node
