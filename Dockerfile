# Use Apify's Puppeteer base image
FROM apify/actor-node-puppeteer-chrome:18

# Set memory limits
ENV NODE_OPTIONS="--max-old-space-size=1024"

# Copy package.json first
COPY package.json ./

# Install dependencies with timeout and registry fixes
RUN npm config set registry https://registry.npmjs.org/ && \
    npm config set fetch-timeout 300000 && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm install --omit=dev --no-audit --no-fund --silent

# Copy source code
COPY . ./

# The Apify platform automatically runs: npm start
CMD npm start
