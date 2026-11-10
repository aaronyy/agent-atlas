FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

RUN pnpm install --frozen-lockfile=false \
 && pnpm --filter @agent-atlas/core build \
 && pnpm --filter @agent-atlas/db build \
 && pnpm --filter @agent-atlas/web build \
 && pnpm --filter @agent-atlas/server build \
 && mkdir -p apps/server/public \
 && cp -R apps/web/dist/. apps/server/public/

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/db/package.json ./packages/db/
COPY --from=build /app/apps/server/package.json ./apps/server/

RUN pnpm install --prod --frozen-lockfile=false --filter @agent-atlas/server...

COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/drizzle ./packages/db/drizzle
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/public ./apps/server/public

EXPOSE 8080
CMD ["sh", "-c", "node packages/db/dist/migrate.js && node apps/server/dist/index.js"]
