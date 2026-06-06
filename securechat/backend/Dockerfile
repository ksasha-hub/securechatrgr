FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies only
FROM base AS deps
COPY package.json ./
RUN npm install --omit=dev

# Final image
FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY src/ ./src/
EXPOSE 3001
USER node
CMD ["node", "src/server.js"]
