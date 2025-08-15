# Use Apify's base image with Playwright
FROM apify/actor-node-playwright-chrome:latest

# Copy package files
COPY package*.json ./

# Install dependencies and browsers
RUN npm ci --omit=dev \
    && npx playwright install chromium \
    && npx playwright install-deps

# Copy source code
COPY . ./

# Start command
CMD npm start
