import { Controller, Get, Logger, Param } from '@nestjs/common';
import { PricingService } from './pricing.service';

@Controller()
export class PricingController {
  private readonly logger = new Logger(PricingController.name);

  constructor(private readonly pricingService: PricingService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'pricing-service' };
  }

  @Get('prices/:flightId')
  getPrice(@Param('flightId') flightId: string) {
    return this.pricingService.getPrice(flightId);
  }
}
