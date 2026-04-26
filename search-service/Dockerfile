FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache bash python3 make g++ pkgconfig librdkafka-dev

COPY kafka-rdkafka-1.0.0.tgz ./
COPY search-service/package*.json ./search-service/
RUN cd search-service && npm install

COPY search-service ./search-service
RUN cd search-service && npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache bash python3 make g++ pkgconfig librdkafka-dev

COPY kafka-rdkafka-1.0.0.tgz ./
COPY search-service/package*.json ./search-service/
RUN cd search-service && npm install --omit=dev

COPY --from=builder /app/search-service/dist ./search-service/dist
EXPOSE 3003
CMD ["node", "search-service/dist/main"]
