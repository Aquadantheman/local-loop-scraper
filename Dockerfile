# Use a lighter base image with Playwright (faster than Puppeteer)
FROM apify/actor-node-playwright:18

# Set memory limits
ENV NODE_OPTIONS="--max-old-space-size=1536"

# Copy package files first (better caching)
COPY package*.json ./

# Install only production dependencies with optimizations
RUN npm ci --only=production --no-audit --no-fund --silent

# Copy source code
COPY . ./

# Optimize Playwright
RUN npx playwright install chromium --with-deps

# Clean up to reduce image size
RUN apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    npm cache clean --force

CMD npm start
