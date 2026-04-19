import { Controller, Get, Logger, Query } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';
import { SearchService } from './search.service';

class SearchFlightDto {
  @IsOptional() @IsString() origin?: string;
  @IsOptional() @IsString() destination?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() passengers?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(100) limit?: number;
}

@Controller()
export class SearchController {
  private readonly logger = new Logger(SearchController.name);

  constructor(private readonly searchService: SearchService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'search-service' };
  }

  @Get('flights')
  search(@Query() query: SearchFlightDto) {
    return this.searchService.searchFlights(query);
  }

  @Get('flights/seed')
  seed() {
    return this.searchService.seedSampleFlights();
  }

  // ─── Kafka: nhận event từ inventory-service ────────────────────────

  @EventPattern('inventory.changed')
  async onInventoryChanged(
    @Payload() data: { flightId: string; seatNo: string; available: boolean },
  ) {
    // available=false → ghế bị lock (trừ 1), available=true → ghế được release (cộng 1)
    const delta = data.available ? 1 : -1;
    this.logger.log(`inventory.changed: flight=${data.flightId} seat=${data.seatNo} delta=${delta}`);
    await this.searchService.updateAvailableSeats(data.flightId, delta);
  }

  // ─── Kafka: nhận giá mới từ pricing-service ────────────────────────

  @EventPattern('pricing.updated')
  async onPricingUpdated(@Payload() data: { flightId: string; price: number }) {
    this.logger.log(`pricing.updated: flight=${data.flightId} price=${data.price}`);
    await this.searchService.updatePrice(data.flightId, data.price);
  }
}
