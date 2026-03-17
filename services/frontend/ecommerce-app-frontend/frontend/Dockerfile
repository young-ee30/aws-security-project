# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

# Copy nginx config as template (API_UPSTREAM will be substituted at startup)
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

# Copy built static files from build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# envsubst substitutes only ${API_UPSTREAM}, leaving nginx $variables untouched
CMD ["/bin/sh", "-c", "envsubst '${API_UPSTREAM}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
