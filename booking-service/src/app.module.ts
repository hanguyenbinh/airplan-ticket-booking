import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingModule } from './booking/booking.module';

function dbPoolSize(): number {
  const n = Number(process.env.DB_POOL_SIZE ?? 10);
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.min(50, Math.floor(n));
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/booking_db',
      poolSize: dbPoolSize(),
      autoLoadEntities: true,
      synchronize: true, // dev only — production dùng migrations
      logging: false,
    }),
    BookingModule,
  ],
})
export class AppModule {}
