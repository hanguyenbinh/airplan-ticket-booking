FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache bash python3 make g++ pkgconfig librdkafka-dev

COPY kafka-rdkafka-1.0.0.tgz ./
COPY inventory-service/package*.json ./inventory-service/
RUN cd inventory-service && npm install

COPY inventory-service ./inventory-service
RUN cd inventory-service && npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache bash python3 make g++ pkgconfig librdkafka-dev

COPY kafka-rdkafka-1.0.0.tgz ./
COPY inventory-service/package*.json ./inventory-service/
RUN cd inventory-service && npm install --omit=dev

COPY --from=builder /app/inventory-service/dist ./inventory-service/dist
EXPOSE 3002
CMD ["node", "inventory-service/dist/main"]
