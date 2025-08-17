# Use Apify's Puppeteer base image (has Chrome pre-installed)
FROM apify/actor-node-puppeteer-chrome:18

# Copy package.json first
COPY package.json ./

# Install dependencies
RUN npm install --omit=dev --silent

# Copy source code
COPY . ./

# The Apify platform automatically runs: npm start
CMD npm start
