FROM node:20-alpine

WORKDIR /app

# Install build tools + headers for USB compilation
RUN apk add --no-cache \
    python3 \
    g++ \
    make \
    bash \
    git \
    linux-headers \
    libusb-dev \
    pkgconfig

COPY package*.json ./

RUN npm config set registry https://registry.npmjs.org/ \
    && npm install --legacy-peer-deps \
    && npm install -g pm2

COPY . .

EXPOSE 5000

CMD ["pm2-runtime", "ecosystem.config.js"]
