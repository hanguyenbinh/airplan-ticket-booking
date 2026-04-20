import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricingModule } from './pricing/pricing.module';

function dbPoolSize(): number {
  const n = Number(process.env.DB_POOL_SIZE ?? 10);
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.min(50, Math.floor(n));
}

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/pricing_db',
      poolSize: dbPoolSize(),
      autoLoadEntities: true,
      synchronize: true,
      logging: false,
    }),
    PricingModule,
  ],
})
export class AppModule {}
