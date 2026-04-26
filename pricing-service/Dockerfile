FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache bash python3 make g++ pkgconfig librdkafka-dev

COPY kafka-rdkafka-1.0.0.tgz ./
COPY pricing-service/package*.json ./pricing-service/
RUN cd pricing-service && npm install

COPY pricing-service ./pricing-service
RUN cd pricing-service && npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache bash python3 make g++ pkgconfig librdkafka-dev

COPY kafka-rdkafka-1.0.0.tgz ./
COPY pricing-service/package*.json ./pricing-service/
RUN cd pricing-service && npm install --omit=dev

COPY --from=builder /app/pricing-service/dist ./pricing-service/dist
EXPOSE 3004
CMD ["node", "pricing-service/dist/main"]
