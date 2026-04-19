import { Controller, Get, Inject, Logger, Param } from '@nestjs/common';
import { ClientKafka, EventPattern, Payload } from '@nestjs/microservices';
import { PricingService } from './pricing.service';

@Controller()
export class PricingController {
  private readonly logger = new Logger(PricingController.name);

  constructor(
    private readonly pricingService: PricingService,
    @Inject('KAFKA_CLIENT') private readonly kafka: ClientKafka,
  ) {}

  async onModuleInit() {
    await this.kafka.connect();
  }

  @Get('health')
  health() {
    return { status: 'ok', service: 'pricing-service' };
  }

  @Get('prices/:flightId')
  getPrice(@Param('flightId') flightId: string) {
    return this.pricingService.getPrice(flightId);
  }

  @EventPattern('inventory.changed')
  async onInventoryChanged(
    @Payload() data: { flightId: string; seatNo: string; available: boolean },
  ) {
    const result = await this.pricingService.onInventoryChanged(data.flightId, data.available);
    if (result) {
      // Giá thay đổi → emit cho search-service cập nhật Elasticsearch
      this.kafka.emit('pricing.updated', result);
      this.logger.log(`pricing.updated emitted: flight=${result.flightId} price=${result.price}`);
    }
  }
}
