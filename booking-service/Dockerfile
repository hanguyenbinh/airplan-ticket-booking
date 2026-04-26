FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache bash python3 make g++ pkgconfig librdkafka-dev

COPY kafka-rdkafka-1.0.0.tgz ./
COPY booking-service/package*.json ./booking-service/
RUN cd booking-service && npm install

COPY booking-service ./booking-service
RUN cd booking-service && npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache bash python3 make g++ pkgconfig librdkafka-dev

COPY kafka-rdkafka-1.0.0.tgz ./
COPY booking-service/package*.json ./booking-service/
RUN cd booking-service && npm install --omit=dev

COPY --from=builder /app/booking-service/dist ./booking-service/dist
EXPOSE 3001
CMD ["node", "booking-service/dist/main"]
