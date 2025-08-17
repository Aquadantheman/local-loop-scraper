# Use your original base image but with optimizations
FROM apify/actor-node-puppeteer-chrome:18

# Set memory limits
ENV NODE_OPTIONS="--max-old-space-size=1536"

# Copy package.json first for better caching
COPY package.json ./

# Install dependencies (use npm install instead of npm ci)
RUN npm install --omit=dev --silent

# Copy source code
COPY . ./

# The Apify platform automatically runs: npm start
CMD npm start
