import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { Repository } from 'typeorm';
import { PricingController } from '../pricing.controller';
import { PricingService } from '../pricing.service';
import { FlightPrice } from '../entities/flight-price.entity';

describe('PricingService (integration)', () => {
  let app: INestApplication;
  let pg: StartedPostgreSqlContainer;
  let priceRepo: Repository<FlightPrice>;

  beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:15-alpine').start();
    const url = pg.getConnectionUri();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url,
          entities: [FlightPrice],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([FlightPrice]),
      ],
      controllers: [PricingController],
      providers: [
        PricingService,
        {
          provide: 'KAFKA_CLIENT',
          useValue: {
            emit: jest.fn(),
            connect: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    priceRepo = moduleFixture.get(getRepositoryToken(FlightPrice));
  });

  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('GET /prices/:flightId returns seeded row', async () => {
    const flightId = '00000000-0000-4000-8000-0000000000dd';
    await priceRepo.save(
      priceRepo.create({
        flightId,
        basePrice: 500000,
        currentPrice: 500000,
        bookedSeats: 0,
        totalSeats: 100,
      }),
    );

    const res = await request(app.getHttpServer()).get(`/prices/${flightId}`).expect(200);
    expect(res.body.flightId).toBe(flightId);
    expect(Number(res.body.currentPrice)).toBe(500000);
  });

  it('PricingService.onInventoryChanged updates DB', async () => {
    const flightId = '00000000-0000-4000-8000-0000000000ee';
    await priceRepo.save(
      priceRepo.create({
        flightId,
        basePrice: 1000000,
        currentPrice: 1000000,
        bookedSeats: 0,
        totalSeats: 100,
      }),
    );
    const svc = app.get(PricingService);
    await svc.onInventoryChanged(flightId, false);
    const row = await priceRepo.findOneBy({ flightId });
    expect(row!.bookedSeats).toBe(1);
  });
});
