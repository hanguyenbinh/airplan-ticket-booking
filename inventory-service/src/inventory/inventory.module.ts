import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Seat } from './entities/seat.entity';
import { InventoryController } from './inventory.controller';
import { SeatLockerService } from './seat-locker.service';
import { SeatAvailabilityPublisherService } from './seat-availability-publisher.service';
import { SharedSeatAvailabilityRedisService } from './shared-seat-availability-redis.service';
import { InventoryKafkaHandlerService } from './inventory.kafka-handler.service';
import { KAFKA_DISPATCHER, KAFKA_TOPICS, KafkaConsumerRunner, KafkaProducer } from 'kafka-rdkafka';

@Module({
  imports: [TypeOrmModule.forFeature([Seat]), ScheduleModule.forRoot()],
  controllers: [InventoryController],
  providers: [
    SeatLockerService,
    KafkaProducer,
    InventoryKafkaHandlerService,
    { provide: KAFKA_TOPICS, useValue: ['seat.lock', 'seat.release', 'seat.confirm'] },
    { provide: KAFKA_DISPATCHER, useExisting: InventoryKafkaHandlerService },
    KafkaConsumerRunner,
    SharedSeatAvailabilityRedisService,
    SeatAvailabilityPublisherService,
  ],
})
export class InventoryModule {}
