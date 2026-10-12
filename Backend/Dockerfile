FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node
EXPOSE 5000
CMD ["node", "server.js"]
