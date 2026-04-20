import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // SIGTERM from K8s → disconnect consumer promptly (avoids long rebalance waits on scale-down)
  app.enableShutdownHooks();

  // Kafka consumer — nhận events từ inventory & payment
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: { brokers: [(process.env.KAFKA_BROKER ?? 'localhost:9092')] },
      consumer: {
        groupId: 'booking-service-group',
        sessionTimeout: Number(process.env.KAFKA_SESSION_TIMEOUT_MS ?? 90000),
        heartbeatInterval: Number(process.env.KAFKA_HEARTBEAT_INTERVAL_MS ?? 10000),
        rebalanceTimeout: Number(process.env.KAFKA_REBALANCE_TIMEOUT_MS ?? 120000),
      },
      
    },
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3001);
  console.log(`booking-service running on :${process.env.PORT ?? 3001}`);
}

bootstrap();
