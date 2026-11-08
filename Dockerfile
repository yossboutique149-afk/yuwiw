# syntax=docker/dockerfile:1
# Node 22 (supported LTS) on Alpine: the Debian base images are blocked by OS
# advisories with no fix available (glibc, acl, attr, gcc). Alpine ships musl and a
# much smaller package set, so the native SQLite module is compiled in the build stage.
FROM node:22-alpine AS build
WORKDIR /app
ENV NODE_ENV=development
# Toolchain for better-sqlite3 (no musl prebuild is published).
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build \
  && npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN apk upgrade --no-cache
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY --from=build /app/shared ./shared
RUN mkdir -p /app/data/uploads /app/data/audio && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["node", "dist-server/index.js"]
