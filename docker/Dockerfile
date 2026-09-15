# Node Alpine -- multi-arch (amd64 + arm64)
FROM oven/bun:1.3.11-alpine AS builder

WORKDIR /app

# Install system dependencies required for Bun
RUN apk add --no-cache wget curl bash

# Accept build arguments for environment variables
ARG AUTH_ENABLED
ARG AUTH_SECRET
ARG APPWRITE_ENDPOINT
ARG APPWRITE_PROJECT_ID
ARG POCKETBASE_URL
ARG SESSION_MAX_AGE

# Copy package files first for caching
COPY package.json bun.lock ./

# Install dependencies (Node)
RUN bun install

# Copy the rest of the project
COPY . .

# Build only the assets needed by the image. The package build script also
# opens vite-bundle-visualizer, which is useful interactively but can keep a
# non-interactive Docker build alive after Vite has finished.
RUN ./node_modules/.bin/vite build

# Serve with nginx
FROM nginx:1.28.2-alpine

COPY --from=builder /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose the nginx port
EXPOSE 4173

CMD ["nginx", "-g", "daemon off;"]
