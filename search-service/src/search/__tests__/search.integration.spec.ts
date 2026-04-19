import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import request from 'supertest';
import { SearchController } from '../search.controller';
import { SearchService } from '../search.service';

describe('SearchService HTTP (integration)', () => {
  let app: INestApplication;
  let es: StartedTestContainer;

  beforeAll(async () => {
    es = await new GenericContainer('docker.elastic.co/elasticsearch/elasticsearch:8.12.2')
      .withExposedPorts(9200)
      .withEnvironment({
        'xpack.security.enabled': 'false',
        'discovery.type': 'single-node',
        'ES_JAVA_OPTS': '-Xms512m -Xmx512m',
      })
      .withStartupTimeout(180_000)
      .withWaitStrategy(Wait.forHttp('/_cluster/health', 9200).forStatusCode(200))
      .start();

    process.env.ELASTICSEARCH_URL = `http://${es.getHost()}:${es.getMappedPort(9200)}`;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [SearchService],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  }, 180000);

  afterAll(async () => {
    await app?.close();
    await es?.stop();
  });

  it('GET /flights/seed then search by route', async () => {
    await request(app.getHttpServer()).get('/flights/seed').expect(200);

    const res = await request(app.getHttpServer())
      .get('/flights')
      .query({ origin: 'SGN', destination: 'HAN' })
      .expect(200);

    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].origin).toBe('SGN');
  });

  it('GET /flights filters by price range', async () => {
    await request(app.getHttpServer()).get('/flights/seed').expect(200);

    const res = await request(app.getHttpServer())
      .get('/flights')
      .query({ origin: 'SGN', destination: 'HAN', minPrice: 700000, maxPrice: 900000 })
      .expect(200);

    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((f: { price: number }) => f.price >= 700000 && f.price <= 900000)).toBe(true);
  });
});
