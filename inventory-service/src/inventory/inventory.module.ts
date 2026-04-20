import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Seat } from './entities/seat.entity';
import { InventoryController } from './inventory.controller';
import { SeatLockerService } from './seat-locker.service';
import { SeatAvailabilityPublisherService } from './seat-availability-publisher.service';
import { SharedSeatAvailabilityRedisService } from './shared-seat-availability-redis.service';
import { KafkaClientModule, KafkaProducer } from '../clients/kafka.client';

@Module({
  imports: [TypeOrmModule.forFeature([Seat]), KafkaClientModule(), ScheduleModule.forRoot()],
  controllers: [InventoryController],
  providers: [
    SeatLockerService,
    KafkaProducer,
    SharedSeatAvailabilityRedisService,
    SeatAvailabilityPublisherService,
  ],
})
export class InventoryModule {}
