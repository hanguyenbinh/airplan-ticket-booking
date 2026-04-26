import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FlightPrice } from './entities/flight-price.entity';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { KAFKA_DISPATCHER, KAFKA_TOPICS, KafkaConsumerRunner, KafkaProducer } from 'kafka-rdkafka';
import { PricingKafkaHandlerService } from './pricing.kafka-handler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FlightPrice]),
  ],
  controllers: [PricingController],
  providers: [
    PricingService,
    KafkaProducer,
    PricingKafkaHandlerService,
    { provide: KAFKA_TOPICS, useValue: ['inventory.changed'] },
    { provide: KAFKA_DISPATCHER, useExisting: PricingKafkaHandlerService },
    KafkaConsumerRunner,
  ],
})
export class PricingModule {}
