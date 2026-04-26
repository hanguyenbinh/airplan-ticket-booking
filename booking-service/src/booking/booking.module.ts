import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingSaga } from './saga/booking.saga';
import { AvailableSeatsCacheService } from './available-seats-cache.service';
import { KAFKA_DISPATCHER, KAFKA_TOPICS, KafkaConsumerRunner, KafkaProducer } from 'kafka-rdkafka';
import { BookingKafkaHandlerService } from './booking.kafka-handler.service';

@Module({
  imports: [TypeOrmModule.forFeature([Booking])],
  controllers: [BookingController],
  providers: [
    BookingService,
    BookingSaga,
    KafkaProducer,
    BookingKafkaHandlerService,
    { provide: KAFKA_TOPICS, useValue: ['seat.locked', 'seat.lock.failed', 'seat.confirmed', 'inventory.available.init', 'inventory.changed'] },
    { provide: KAFKA_DISPATCHER, useExisting: BookingKafkaHandlerService },
    KafkaConsumerRunner,
    AvailableSeatsCacheService,
  ],
})
export class BookingModule {}
