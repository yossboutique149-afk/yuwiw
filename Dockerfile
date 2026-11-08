# syntax=docker/dockerfile:1
# Node 22 (supported LTS) on Debian 13 "trixie": the Debian 12 packages flagged by the
# image scan (glibc, zlib, acl, attr, gcc-12) have no fix available in bookworm.
FROM node:22-trixie-slim AS build
WORKDIR /app
ENV NODE_ENV=development
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-trixie-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY shared ./shared
RUN mkdir -p /app/data/uploads /app/data/audio && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "dist-server/index.js"]
