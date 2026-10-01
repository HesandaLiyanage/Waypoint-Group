# Build stage
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.6.0 --activate

WORKDIR /app

# Copy root workspace and package files
COPY package.json pnpm-workspace.yaml ./
COPY packages/ ./packages/
COPY apps/web/package.json ./apps/web/

# Install dependencies
RUN pnpm install --frozen-lockfile=false

# Copy web source code
COPY apps/web/ ./apps/web/

# Build PWA
RUN pnpm --filter web build

# Production static server stage
FROM nginx:alpine

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 3000;
    server_name localhost;

    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
