import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { KAFKA_DISPATCHER, KAFKA_TOPICS, KafkaConsumerRunner } from 'kafka-rdkafka';
import { SearchKafkaHandlerService } from './search.kafka-handler.service';

@Module({
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchKafkaHandlerService,
    { provide: KAFKA_TOPICS, useValue: ['inventory.changed', 'pricing.updated'] },
    { provide: KAFKA_DISPATCHER, useExisting: SearchKafkaHandlerService },
    KafkaConsumerRunner,
  ],
})
export class SearchModule {}
