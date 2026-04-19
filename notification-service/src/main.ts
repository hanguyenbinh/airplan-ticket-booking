import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.KAFKA,
    options: {
      client: { brokers: [(process.env.KAFKA_BROKER ?? 'localhost:9092')] },
      consumer: { groupId: 'notification-service-group' },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3005);
  console.log(`notification-service running on :${process.env.PORT ?? 3005}`);
}

bootstrap();
