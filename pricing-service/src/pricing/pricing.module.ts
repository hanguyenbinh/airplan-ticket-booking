import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { FlightPrice } from './entities/flight-price.entity';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FlightPrice]),
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          producerOnlyMode: true,
          client: {
            clientId: 'pricing-service',
            brokers: [(process.env.KAFKA_BROKER ?? 'localhost:9092')],
            requestTimeout: Number(process.env.KAFKA_REQUEST_TIMEOUT_MS ?? 120000),
          },
          producer: { allowAutoTopicCreation: true },
        },
      },
    ]),
  ],
  controllers: [PricingController],
  providers: [PricingService],
})
export class PricingModule {}
