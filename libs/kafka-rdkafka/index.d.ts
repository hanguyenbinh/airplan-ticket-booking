import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';

export const KAFKA_TOPICS: unique symbol;
export const KAFKA_DISPATCHER: unique symbol;

export type KafkaDispatcher = {
  dispatch(topic: string, payload: any): Promise<void> | void;
};

export class KafkaProducer implements OnModuleInit, OnModuleDestroy {
  emit(topic: string, payload: unknown): void;
}

export class KafkaConsumerRunner implements OnModuleInit, OnModuleDestroy {}

