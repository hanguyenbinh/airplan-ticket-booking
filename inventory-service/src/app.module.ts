import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryModule } from './inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/inventory_db',
      autoLoadEntities: true,
      synchronize: true,
      logging: false,
    }),
    InventoryModule,
  ],
})
export class AppModule {}
