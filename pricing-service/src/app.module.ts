import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricingModule } from './pricing/pricing.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/pricing_db',
      autoLoadEntities: true,
      synchronize: true,
      logging: false,
    }),
    PricingModule,
  ],
})
export class AppModule {}
