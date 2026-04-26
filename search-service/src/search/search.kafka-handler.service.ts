import { Injectable, Logger } from '@nestjs/common';
import { SearchService } from './search.service';

@Injectable()
export class SearchKafkaHandlerService {
  private readonly logger = new Logger(SearchKafkaHandlerService.name);

  constructor(private readonly searchService: SearchService) {}

  async dispatch(topic: string, payload: any) {
    if (topic === 'inventory.changed') {
      const delta = payload?.available ? 1 : -1;
      this.logger.log(
        `inventory.changed: flight=${payload?.flightId} seat=${payload?.seatNo} delta=${delta}`,
      );
      await this.searchService.updateAvailableSeats(payload.flightId, delta);
      return;
    }

    if (topic === 'pricing.updated') {
      this.logger.log(`pricing.updated: flight=${payload?.flightId} price=${payload?.price}`);
      await this.searchService.updatePrice(payload.flightId, payload.price);
      return;
    }
  }
}

