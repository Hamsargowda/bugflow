# Stage 1 — build the static React/Vite bundle
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2 — serve it with nginx, proxying /api, /docs, /openapi.json and
# /health to the server container (the dev-only Vite proxy in vite.config.js
# doesn't exist in this static build, so nginx takes over that job).
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
