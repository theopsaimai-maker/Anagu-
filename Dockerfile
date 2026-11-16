# Build stage (Node 22 matches Vite 8 engine & native TS server execution requirements)
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# Production full-stack runtime stage (Express API + built Vite SPA + PostgreSQL/Supabase)
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.ts ./server.ts
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/types ./src/types
COPY --from=builder /app/supabase ./supabase

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health >/dev/null || exit 1

CMD ["node", "server.ts"]
