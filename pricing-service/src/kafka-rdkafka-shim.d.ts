declare module 'kafka-rdkafka' {
  import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';

  export const KAFKA_TOPICS: symbol;
  export const KAFKA_DISPATCHER: symbol;

  export class KafkaProducer implements OnModuleInit, OnModuleDestroy {
    emit(topic: string, payload: unknown): void;
  }

  export class KafkaConsumerRunner implements OnModuleInit, OnModuleDestroy {}
}

