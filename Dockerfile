# Use the official Apify SDK image with Node.js 18
FROM apify/actor-node:18

# Copy package.json and package-lock.json first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production --silent

# Copy the entire source code
COPY . ./

# Ensure proper permissions
RUN chmod +x ./src/main.js

# The Apify platform automatically runs: npm start
CMD npm start
