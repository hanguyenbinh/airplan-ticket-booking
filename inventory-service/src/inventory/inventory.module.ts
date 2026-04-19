import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Seat } from './entities/seat.entity';
import { InventoryController } from './inventory.controller';
import { SeatLockerService } from './seat-locker.service';
import { KafkaClientModule, KafkaProducer } from '../clients/kafka.client';

@Module({
  imports: [TypeOrmModule.forFeature([Seat]), KafkaClientModule(), ScheduleModule.forRoot()],
  controllers: [InventoryController],
  providers: [SeatLockerService, KafkaProducer],
})
export class InventoryModule {}
