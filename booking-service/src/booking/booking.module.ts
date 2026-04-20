import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { BookingSaga } from './saga/booking.saga';
import { AvailableSeatsCacheService } from './available-seats-cache.service';
import { KafkaClientModule, KafkaProducer } from '../clients/kafka.client';

@Module({
  imports: [TypeOrmModule.forFeature([Booking]), KafkaClientModule()],
  controllers: [BookingController],
  providers: [
    BookingService,
    BookingSaga,
    KafkaProducer,
    AvailableSeatsCacheService,
  ],
})
export class BookingModule {}
