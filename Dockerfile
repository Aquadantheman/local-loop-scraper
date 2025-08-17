# Use Apify's Puppeteer base image (has Chrome pre-installed)
FROM apify/actor-node-puppeteer-chrome:18

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production --silent

# Copy source code
COPY . ./

# Ensure proper permissions
RUN chmod +x ./src/main.js

# The Apify platform automatically runs: npm start
CMD npm start
