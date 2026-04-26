const { Injectable, Logger, Inject } = require('@nestjs/common')
const Kafka = require('node-rdkafka')

// Minimal decorator helpers (what TS normally emits)
const __decorate =
  (this && this.__decorate) ||
  function (decorators, target, key, desc) {
    let c = arguments.length
    let r = c < 3 ? target : desc === null ? (desc = Object.getOwnPropertyDescriptor(target, key)) : desc
    for (let i = decorators.length - 1; i >= 0; i--) {
      const d = decorators[i]
      if (d) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r
    }
    if (c > 3 && r) Object.defineProperty(target, key, r)
    return r
  }

const __param =
  (this && this.__param) ||
  function (paramIndex, decorator) {
    return function (target, key) {
      decorator(target, key, paramIndex)
    }
  }

// Tokens (symbols avoid accidental clashes)
const KAFKA_TOPICS = Symbol('KAFKA_TOPICS')
const KAFKA_DISPATCHER = Symbol('KAFKA_DISPATCHER')

function brokerList() {
  return process.env.KAFKA_BROKER ?? 'localhost:9092'
}

let KafkaProducer = class KafkaProducer {
  constructor() {
    this.logger = new Logger(KafkaProducer.name)
    this.ready = false
    this.producer = new Kafka.Producer(
      {
        'metadata.broker.list': brokerList(),
        'client.id': process.env.KAFKA_CLIENT_ID ?? 'service-producer',
        'dr_cb': true,
        'socket.timeout.ms': Number(process.env.KAFKA_SOCKET_TIMEOUT_MS ?? 60000),
        'message.send.max.retries': Number(process.env.KAFKA_SEND_MAX_RETRIES ?? 3),
        'retry.backoff.ms': Number(process.env.KAFKA_RETRY_BACKOFF_MS ?? 250),
      },
      {},
    )
  }

  async onModuleInit() {
    if (this.ready) return

    await new Promise((resolve, reject) => {
      this.producer
        .on('ready', () => {
          this.ready = true
          this.logger.log('librdkafka producer ready')
          resolve()
        })
        .on('event.error', (err) => {
          this.logger.error(`producer error: ${err?.message ?? err}`)
        })
        .on('delivery-report', (err) => {
          if (err) this.logger.warn(`delivery failed: ${err.message}`)
        })

      this.producer.connect(undefined, (err) => {
        if (err) reject(err)
      })
    })
  }

  emit(topic, payload) {
    if (!this.ready) {
      this.logger.warn(`producer not ready; dropping topic=${topic}`)
      return
    }

    const value = Buffer.from(JSON.stringify(payload))
    try {
      this.producer.produce(topic, null, value, undefined, Date.now())
      this.producer.poll()
    } catch (err) {
      this.logger.error(`produce failed topic=${topic}: ${err?.message ?? err}`)
    }
  }

  async onModuleDestroy() {
    if (!this.ready) return
    await new Promise((resolve) => {
      this.producer.flush(10000, () => {
        this.producer.disconnect(() => resolve())
      })
    })
  }
}
KafkaProducer = __decorate([Injectable()], KafkaProducer)

let KafkaConsumerRunner = class KafkaConsumerRunner {
  constructor(topics, dispatcher) {
    this.logger = new Logger(KafkaConsumerRunner.name)
    this.consumer = null
    this.processing = Promise.resolve()
    this.topics = Array.isArray(topics) ? topics : []
    this.dispatcher = dispatcher
  }

  async onModuleInit() {
    const groupId = process.env.KAFKA_GROUP_ID ?? 'service-group'
    const sessionTimeoutMs = Number(process.env.KAFKA_SESSION_TIMEOUT_MS ?? 90000)

    const consumer = new Kafka.KafkaConsumer(
      {
        'metadata.broker.list': brokerList(),
        'group.id': groupId,
        'client.id': process.env.KAFKA_CONSUMER_CLIENT_ID ?? 'service-consumer',

        // Cooperative rebalancing (librdkafka)
        'partition.assignment.strategy': 'cooperative-sticky',

        'session.timeout.ms': sessionTimeoutMs,
        'heartbeat.interval.ms': Number(process.env.KAFKA_HEARTBEAT_INTERVAL_MS ?? 10000),

        'enable.auto.commit': false,
        'enable.partition.eof': false,
        'socket.timeout.ms': Number(process.env.KAFKA_SOCKET_TIMEOUT_MS ?? 60000),
      },
      {},
    )

    this.consumer = consumer

    consumer
      .on('ready', () => {
        this.logger.log(`librdkafka consumer ready; subscribing topics=${this.topics.join(',')}`)
        consumer.subscribe(this.topics)
        consumer.consume()
      })
      .on('data', (message) => {
        this.processing = this.processing.then(() => this.handleMessage(message))
      })
      .on('event.error', (err) => {
        this.logger.error(`consumer error: ${err?.message ?? err}`)
      })

    await new Promise((resolve, reject) => {
      consumer.connect(undefined, (err) => (err ? reject(err) : resolve()))
    })
  }

  async handleMessage(message) {
    const topic = message.topic ?? ''
    const raw = message.value ? message.value.toString('utf8') : ''

    try {
      const payload = raw ? JSON.parse(raw) : null
      if (!this.dispatcher || typeof this.dispatcher.dispatch !== 'function') {
        this.logger.warn(`no dispatcher; dropping topic=${topic}`)
        return
      }

      await this.dispatcher.dispatch(topic, payload)
      this.consumer?.commitMessage(message)
    } catch (err) {
      this.logger.error(
        `failed handling topic=${topic}: ${err?.message ?? err} raw=${raw.slice(0, 500)}`,
      )
    }
  }

  async onModuleDestroy() {
    const c = this.consumer
    if (!c) return

    try {
      await this.processing
    } finally {
      await new Promise((resolve) => c.disconnect(() => resolve()))
      this.consumer = null
    }
  }
}
KafkaConsumerRunner = __decorate(
  [Injectable(), __param(0, Inject(KAFKA_TOPICS)), __param(1, Inject(KAFKA_DISPATCHER))],
  KafkaConsumerRunner,
)

module.exports = {
  KAFKA_TOPICS,
  KAFKA_DISPATCHER,
  KafkaProducer,
  KafkaConsumerRunner,
}

