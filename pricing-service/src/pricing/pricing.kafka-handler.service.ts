import { Injectable, Logger } from '@nestjs/common';
import { KafkaProducer } from 'kafka-rdkafka';
import { PricingService } from './pricing.service';

@Injectable()
export class PricingKafkaHandlerService {
  private readonly logger = new Logger(PricingKafkaHandlerService.name);

  constructor(
    private readonly pricingService: PricingService,
    private readonly kafka: KafkaProducer,
  ) {}

  async dispatch(topic: string, payload: any) {
    if (topic !== 'inventory.changed') return;

    const result = await this.pricingService.onInventoryChanged(payload.flightId, payload.available);
    if (result) {
      this.kafka.emit('pricing.updated', result);
      this.logger.log(`pricing.updated emitted: flight=${result.flightId} price=${result.price}`);
    }
  }
}

