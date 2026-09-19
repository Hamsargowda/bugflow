# BugFlow API — Node/Express equivalent of the "python:3.11-slim + uvicorn"
# image called for in the Milestone 4 spec. node-postgres (`pg`) ships a
# pure-JS driver, so unlike psycopg2 there's no libpq-dev/build-essential
# step needed here — just Node itself.
FROM node:20-slim

WORKDIR /app

# Install dependencies first so this layer is cached across code changes.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 4000

# Liveness probe used by docker-compose's healthcheck (see docker-compose.yml).
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
