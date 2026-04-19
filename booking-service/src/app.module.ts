import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingModule } from './booking/booking.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/booking_db',
      autoLoadEntities: true,
      synchronize: true, // dev only — production dùng migrations
      logging: false,
    }),
    BookingModule,
  ],
})
export class AppModule {}
