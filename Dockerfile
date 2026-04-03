# Stage 1: Build the Frontend
FROM node:18-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Final Backend Image
FROM node:18-slim
WORKDIR /app

# Install system dependencies for network scanning
RUN apt-get update && apt-get install -y \
    iputils-ping \
    iproute2 \
    && rm -rf /var/lib/apt/lists/*

# Copy backend package.json and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy backend files
COPY . .

# Copy the built frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose the backend port
EXPOSE 3001

# Command to run the application
CMD ["node", "server.js"]
