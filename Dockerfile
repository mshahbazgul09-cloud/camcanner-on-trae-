# Stage 1: Build the frontend
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source files and build
COPY . .
RUN npm run build

# Stage 2: Production server
FROM node:18-alpine AS production

WORKDIR /app

# Copy package files and install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy server files
COPY server ./server

# Copy built frontend files
COPY --from=builder /app/dist ./dist

# Create required directories
RUN mkdir -p server/uploads server/data

# Initialize empty users file if not present
RUN [ ! -f server/data/users.json ] && echo "[]" > server/data/users.json || true

# Environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Start the server
CMD ["node", "server/index.js"]
