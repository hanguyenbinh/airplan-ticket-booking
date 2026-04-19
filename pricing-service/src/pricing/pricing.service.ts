import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FlightPrice } from './entities/flight-price.entity';

/**
 * Dynamic Pricing — tính giá theo demand:
 * - < 30% đặt → giá thấp nhất (basePrice)
 * - 30–60%   → basePrice * 1.2
 * - 60–80%   → basePrice * 1.5
 * - > 80%    → basePrice * 2.0 (surge pricing)
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    @InjectRepository(FlightPrice) private readonly repo: Repository<FlightPrice>,
  ) {}

  private calculatePrice(basePrice: number, bookedSeats: number, totalSeats: number): number {
    const occupancy = totalSeats > 0 ? bookedSeats / totalSeats : 0;
    let multiplier = 1.0;
    if (occupancy >= 0.8)      multiplier = 2.0;
    else if (occupancy >= 0.6) multiplier = 1.5;
    else if (occupancy >= 0.3) multiplier = 1.2;

    // Làm tròn đến hàng nghìn
    return Math.round((basePrice * multiplier) / 1000) * 1000;
  }

  async onInventoryChanged(
    flightId: string,
    available: boolean,
  ): Promise<{ flightId: string; price: number } | null> {
    let record = await this.repo.findOneBy({ flightId });
    if (!record) {
      // Tạo record mặc định nếu chưa có
      record = this.repo.create({
        flightId,
        basePrice: 850000,
        currentPrice: 850000,
        bookedSeats: 0,
        totalSeats: 150,
      });
    }

    // available=false → seat bị lock/booked → tăng count
    record.bookedSeats = Math.max(
      0,
      record.bookedSeats + (available ? -1 : 1),
    );

    const newPrice = this.calculatePrice(record.basePrice, record.bookedSeats, record.totalSeats);
    const priceChanged = newPrice !== Number(record.currentPrice);

    record.currentPrice = newPrice;
    await this.repo.save(record);

    this.logger.log(
      `Flight ${flightId}: occupancy=${((record.bookedSeats / record.totalSeats) * 100).toFixed(1)}% → price=${newPrice}`,
    );

    // Chỉ emit event khi giá thực sự thay đổi (tránh spam)
    return priceChanged ? { flightId, price: newPrice } : null;
  }

  async getPrice(flightId: string) {
    return this.repo.findOneBy({ flightId });
  }
}
