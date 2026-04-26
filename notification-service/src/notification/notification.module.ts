import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { KAFKA_DISPATCHER, KAFKA_TOPICS, KafkaConsumerRunner } from 'kafka-rdkafka';
import { NotificationKafkaHandlerService } from './notification.kafka-handler.service';

@Module({
  controllers: [NotificationController],
  providers: [
    NotificationKafkaHandlerService,
    { provide: KAFKA_TOPICS, useValue: ['booking.confirmed', 'booking.failed'] },
    { provide: KAFKA_DISPATCHER, useExisting: NotificationKafkaHandlerService },
    KafkaConsumerRunner,
  ],
})
export class NotificationModule {}
