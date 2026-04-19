import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { BookingController } from '../booking.controller';
import { BookingService } from '../booking.service';
import { BookingSaga } from '../saga/booking.saga';
import { Booking } from '../entities/booking.entity';
import { KafkaProducer } from '../../clients/kafka.client';

describe('BookingService HTTP (integration)', () => {
  let app: INestApplication;
  let pg: StartedPostgreSqlContainer;
  const kafkaEmit = jest.fn();

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:15-alpine').start();
    const url = pg.getConnectionUri();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url,
          entities: [Booking],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Booking]),
      ],
      controllers: [BookingController],
      providers: [
        BookingService,
        BookingSaga,
        {
          provide: KafkaProducer,
          useValue: {
            emit: kafkaEmit,
            onModuleInit: async () => {},
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  beforeEach(() => {
    kafkaEmit.mockClear();
  });

  it('POST /bookings accepts valid DTO and persists INITIATED', async () => {
    const dto = {
      flightId: '00000000-0000-4000-8000-000000000001',
      seatNo: '10A',
      passengerName: 'Integration User',
      totalAmount: 850000,
    };

    const res = await request(app.getHttpServer()).post('/bookings').send(dto).expect(202);

    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('INITIATED');
    expect(res.body.flightId).toBe(dto.flightId);

    const get = await request(app.getHttpServer()).get(`/bookings/${res.body.id}`).expect(200);
    expect(get.body.status).toBe('INITIATED');
  });

  it('POST /bookings returns 400 for invalid flightId', async () => {
    await request(app.getHttpServer())
      .post('/bookings')
      .send({
        flightId: 'not-a-uuid',
        seatNo: '10A',
        passengerName: 'X',
        totalAmount: 1,
      })
      .expect(400);
  });

  it('GET /bookings/:id returns 404 for unknown id', async () => {
    await request(app.getHttpServer())
      .get('/bookings/00000000-0000-4000-8000-00000000dead')
      .expect(404);
  });
});
