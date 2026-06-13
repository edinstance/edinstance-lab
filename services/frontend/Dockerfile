FROM node:24-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
ARG VITE_PLATFORM_API_URL=https://api.edinstance.uk
ENV VITE_PLATFORM_API_URL=$VITE_PLATFORM_API_URL
RUN pnpm build && pnpm prune --prod

FROM node:24-bookworm-slim

ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000

WORKDIR /app
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/instrumentation.mjs ./instrumentation.mjs

USER node
EXPOSE 3000
CMD ["node", "--import", "./instrumentation.mjs", ".output/server/index.mjs"]
