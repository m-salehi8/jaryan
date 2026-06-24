# ---- Stage 1: Build ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json ./

# Install dependencies
RUN yarn install --network-timeout 600000

# Copy the rest of the source
COPY . .

# Build args injected at build time
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

# Disable ESLint build failures and visual-edits in production
ENV DISABLE_ESLINT_PLUGIN=true
ENV NODE_ENV=production

RUN yarn build

# ---- Stage 2: Serve with Nginx ----
FROM nginx:1.27-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
