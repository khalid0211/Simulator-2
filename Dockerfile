FROM node:22-bookworm-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install backend dependencies
COPY server/package*.json ./server/
RUN npm --prefix server install --omit=dev

# Install frontend dependencies (ignore Windows lockfile so Linux native @rolldown/binding-linux-x64-gnu is installed)
COPY sim-app/package.json ./sim-app/
RUN npm --prefix sim-app install --include=dev --no-package-lock

COPY server ./server
COPY sim-app ./sim-app
RUN rm -f sim-app/package-lock.json

ARG SIM_VERSION=2.0.0
ENV SIM_VERSION=${SIM_VERSION}
RUN npm --prefix sim-app run build

# Production runtime image
FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

COPY --from=builder /app/server ./server
COPY --from=builder /app/sim-app/dist ./sim-app/dist

EXPOSE 4000

CMD ["node", "server/src/index.js"]
