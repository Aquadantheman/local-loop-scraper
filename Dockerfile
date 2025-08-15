# Use Apify's base image with Playwright pre-installed
FROM apify/actor-node-playwright-chrome:20

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source code
COPY . ./

# Install Playwright browsers
RUN npx playwright install chromium

# Set the command to run
CMD ["npm", "start"]
