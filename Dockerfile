# Use Apify's Puppeteer base image (has Chrome pre-installed)
FROM apify/actor-node-puppeteer-chrome:18

# Copy package.json first
COPY package.json ./

# Install dependencies (use npm install instead of npm ci for more flexibility)
RUN npm install --omit=dev --silent

# Copy source code
COPY . ./

# Ensure proper permissions
RUN chmod +x ./src/main.js

# The Apify platform automatically runs: npm start
CMD npm start
