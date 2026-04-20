import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: { brokers: [(process.env.KAFKA_BROKER ?? 'localhost:9092')] },
      consumer: {
        groupId: 'pricing-service-group',
        sessionTimeout: Number(process.env.KAFKA_SESSION_TIMEOUT_MS ?? 90000),
        heartbeatInterval: Number(process.env.KAFKA_HEARTBEAT_INTERVAL_MS ?? 10000),
        rebalanceTimeout: Number(process.env.KAFKA_REBALANCE_TIMEOUT_MS ?? 120000),
      },
      
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3004);
  console.log(`pricing-service running on :${process.env.PORT ?? 3004}`);
}

bootstrap();
