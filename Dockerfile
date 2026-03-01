# Build stage: install dependencies and run Vite build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source files and build
COPY . .
RUN npm run build

# Runtime stage: serve built assets with nginx
FROM nginxinc/nginx-unprivileged:alpine

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy Vite build output
COPY --from=builder /app/dist /usr/share/nginx/html

# Make assets/js directory writable for config injection
USER root
RUN chown -R 101:101 /usr/share/nginx/html/assets/js
USER 101

# Copy entrypoint script with execute permissions
COPY --chmod=755 entrypoint.sh /docker-entrypoint.d/40-inject-config.sh

EXPOSE 8080

# Default nginx entrypoint will run our script and start nginx
