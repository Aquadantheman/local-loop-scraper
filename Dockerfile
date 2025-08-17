# Use the official Apify SDK image with Node.js 18
FROM apify/actor-node:18

# Install system dependencies first
RUN apt-get update && apt-get install -y \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libgtk-3-0 \
    libgtk-4-1 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production --silent

# Install Playwright browsers with explicit dependencies
RUN npx playwright install chromium --with-deps

# Copy the entire source code
COPY . ./

# Ensure proper permissions
RUN chmod +x ./src/main.js

# The Apify platform automatically runs: npm start
CMD npm start
