FROM node:22-bookworm-slim

# Install Chromium and git dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium
ENV PORT=3000
ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start:http"]
