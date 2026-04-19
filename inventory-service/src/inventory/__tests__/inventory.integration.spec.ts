import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import request from 'supertest';
import { InventoryController } from '../inventory.controller';
import { SeatLockerService } from '../seat-locker.service';
import { Seat } from '../entities/seat.entity';
import { KafkaProducer } from '../../clients/kafka.client';

describe('InventoryService (integration)', () => {
  let app: INestApplication;
  let pg: StartedPostgreSqlContainer;
  let redisC: StartedRedisContainer;
  let locker: SeatLockerService;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:15-alpine').start();
    redisC = await new RedisContainer('redis:7-alpine').start();
    process.env.DB_URL = pg.getConnectionUri();
    process.env.REDIS_URL = redisC.getConnectionUrl();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: pg.getConnectionUri(),
          entities: [Seat],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Seat]),
      ],
      controllers: [InventoryController],
      providers: [
        SeatLockerService,
        {
          provide: KafkaProducer,
          useValue: { emit: jest.fn(), onModuleInit: async () => {} },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    locker = moduleFixture.get(SeatLockerService);
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    await redisC?.stop();
  });

  it('GET /health returns ok', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok', service: 'inventory-service' });
  });

  it('lock then confirm marks seat BOOKED', async () => {
    const flightId = '00000000-0000-4000-8000-000000000099';
    const bookingId = '00000000-0000-4000-8000-000000000088';
    const seatNo = '11C';

    const lock1 = await locker.lock(bookingId, flightId, seatNo, 600);
    expect(lock1.success).toBe(true);

    const ok = await locker.confirm(flightId, seatNo, lock1.lockToken!);
    expect(ok).toBe(true);

    const res = await request(app.getHttpServer()).get(`/flights/${flightId}/seats/${seatNo}`).expect(200);
    expect(res.body.status).toBe('BOOKED');
  });

  it('double lock on same seat fails', async () => {
    const flightId = '00000000-0000-4000-8000-000000000077';
    const seatNo = '12D';

    const a = await locker.lock('00000000-0000-4000-8000-0000000000a1', flightId, seatNo);
    expect(a.success).toBe(true);
    const b = await locker.lock('00000000-0000-4000-8000-0000000000a2', flightId, seatNo);
    expect(b.success).toBe(false);
  });

  it('lock then release returns seat AVAILABLE', async () => {
    const flightId = '00000000-0000-4000-8000-000000000066';
    const bookingId = '00000000-0000-4000-8000-000000000055';
    const seatNo = '13E';

    const lock1 = await locker.lock(bookingId, flightId, seatNo, 600);
    expect(lock1.success).toBe(true);
    await locker.release(flightId, seatNo, lock1.lockToken!);

    const res = await request(app.getHttpServer()).get(`/flights/${flightId}/seats/${seatNo}`).expect(200);
    expect(res.body.status).toBe('AVAILABLE');
  });
});
