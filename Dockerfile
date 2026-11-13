# Build stage (Node 22 matches Vite 8 engine requirements)
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# Production serve stage using Nginx Alpine
FROM nginx:alpine
ENV PORT=80

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
