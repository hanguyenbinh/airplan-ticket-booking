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
      consumer: { groupId: 'pricing-service-group' },
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3004);
  console.log(`pricing-service running on :${process.env.PORT ?? 3004}`);
}

bootstrap();
