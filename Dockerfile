FROM oven/bun:1-debian AS deps
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

FROM oven/bun:1-debian AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    TOKENMAXXX_DB_PATH=/data/usage.db
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bunfig.toml pricing.json ./
COPY src ./src
RUN mkdir -p /data && chmod 0777 /data
VOLUME /data
EXPOSE 3000
CMD ["bun", "src/server/index.ts"]
