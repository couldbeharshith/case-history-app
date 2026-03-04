# Build nextjs fe
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Runtime (py, node)
FROM python:3.13-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/ ./backend/
RUN cd backend && uv sync

# Install Playwright and Chromium browser with system deps
RUN cd backend && uv run playwright install --with-deps chromium

# Copy built frontend
COPY --from=frontend-builder /app/frontend/.next ./frontend/.next
COPY --from=frontend-builder /app/frontend/public ./frontend/public
COPY --from=frontend-builder /app/frontend/package*.json ./frontend/
COPY --from=frontend-builder /app/frontend/node_modules ./frontend/node_modules
COPY frontend/next.config.ts ./frontend/

# Create startup script (Render uses PORT env variable)
RUN echo '#!/bin/bash\n\
cd /app/backend && uv run uvicorn api:app --host 127.0.0.1 --port 8000 &\n\
cd /app/frontend && PORT=${PORT:-3000} npm start &\n\
while true; do\n\
  curl -s https://example.com > /dev/null 2>&1\n\
  sleep 30\n\
done' > /app/start.sh && chmod +x /app/start.sh

EXPOSE ${PORT:-3000}

CMD ["/app/start.sh"]
