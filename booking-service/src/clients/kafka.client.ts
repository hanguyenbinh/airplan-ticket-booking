import { ClientKafka, ClientsModule, Transport } from '@nestjs/microservices';
import { DynamicModule, Inject, Injectable } from '@nestjs/common';

export const KAFKA_CLIENT = 'KAFKA_CLIENT';

export function KafkaClientModule(): DynamicModule {
  return ClientsModule.register([
    {
      name: KAFKA_CLIENT,
      transport: Transport.KAFKA,
      options: {
        // We only use emit(); disable the hidden reply consumer (default group nestjs-group-client)
        // that otherwise heartbeats and can crash under heavy HTTP load on the same Node process.
        producerOnlyMode: true,
        client: {
          clientId: 'booking-service',
          brokers: [(process.env.KAFKA_BROKER ?? 'localhost:9092')],
          requestTimeout: Number(process.env.KAFKA_REQUEST_TIMEOUT_MS ?? 120000),
        },
        producer: { allowAutoTopicCreation: true },
      },
    },
  ]);
}

@Injectable()
export class KafkaProducer {
  constructor(@Inject(KAFKA_CLIENT) private readonly client: ClientKafka) {}

  async onModuleInit() {
    await this.client.connect();
  }

  emit(topic: string, payload: unknown) {
    this.client.emit(topic, payload);
  }
}
