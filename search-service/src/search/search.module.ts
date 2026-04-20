import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'KAFKA_CLIENT',
        transport: Transport.KAFKA,
        options: {
          producerOnlyMode: true,
          client: {
            clientId: 'search-service',
            brokers: [(process.env.KAFKA_BROKER ?? 'localhost:9092')],
            requestTimeout: Number(process.env.KAFKA_REQUEST_TIMEOUT_MS ?? 120000),
          },
          producer: { allowAutoTopicCreation: true },
        },
      },
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
