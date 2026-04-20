import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client as ElasticClient } from '@elastic/elasticsearch';

const INDEX = 'flights';

export interface FlightDoc {
  flightId: string;
  flightNo: string;
  airline: string;
  origin: string;         // IATA code: SGN, HAN, DAD
  destination: string;
  departureAt: string;    // ISO8601
  arrivalAt: string;
  price: number;
  currency: string;
  availableSeats: number;
  totalSeats: number;
}

export interface SearchFlightsQuery {
  origin?: string;
  destination?: string;
  date?: string;          // YYYY-MM-DD
  minPrice?: number;
  maxPrice?: number;
  passengers?: number;
  page?: number;
  limit?: number;
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private readonly es: ElasticClient;

  constructor() {
    this.es = new ElasticClient({
      node: process.env.ELASTICSEARCH_URL ?? 'http://localhost:9200',
    });
  }

  async onModuleInit() {
    await this.ensureIndex();
  }

  /** Tạo index với mapping nếu chưa có */
  private async ensureIndex() {
    const exists = await this.es.indices.exists({ index: INDEX });
    if (!exists) {
      await this.es.indices.create({
        index: INDEX,
        mappings: {
          properties: {
            flightId:       { type: 'keyword' },
            flightNo:       { type: 'keyword' },
            airline:        { type: 'text', fields: { keyword: { type: 'keyword' } } },
            origin:         { type: 'keyword' },
            destination:    { type: 'keyword' },
            departureAt:    { type: 'date' },
            arrivalAt:      { type: 'date' },
            price:          { type: 'double' },
            currency:       { type: 'keyword' },
            availableSeats: { type: 'integer' },
            totalSeats:     { type: 'integer' },
          },
        },
      });
      this.logger.log(`Elasticsearch index '${INDEX}' created`);
    }
  }

  /** Tìm kiếm chuyến bay */
  async searchFlights(q: SearchFlightsQuery) {
    const page  = q.page  ?? 1;
    const limit = q.limit ?? 10;
    const from  = (page - 1) * limit;

    const must: object[] = [];

    if (q.origin)      must.push({ term: { origin: q.origin.toUpperCase() } });
    if (q.destination) must.push({ term: { destination: q.destination.toUpperCase() } });
    if (q.passengers)  must.push({ range: { availableSeats: { gte: q.passengers } } });

    // Filter theo ngày (cả ngày hôm đó)
    if (q.date) {
      must.push({
        range: {
          departureAt: {
            gte: `${q.date}T00:00:00`,
            lte: `${q.date}T23:59:59`,
          },
        },
      });
    }

    // Price range
    if (q.minPrice || q.maxPrice) {
      const priceRange: Record<string, number> = {};
      if (q.minPrice) priceRange.gte = q.minPrice;
      if (q.maxPrice) priceRange.lte = q.maxPrice;
      must.push({ range: { price: priceRange } });
    }

    const response = await this.es.search<FlightDoc>({
      index: INDEX,
      from,
      size: limit,
      sort: [{ price: 'asc' }, { departureAt: 'asc' }],
      query: must.length > 0 ? { bool: { must } } : { match_all: {} },
    });

    const hits = response.hits.hits;
    const total = typeof response.hits.total === 'number'
      ? response.hits.total
      : response.hits.total?.value ?? 0;

    return {
      data: hits.map((h) => h._source),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Upsert flight document (gọi khi seed data hoặc flight info thay đổi) */
  async upsertFlight(doc: FlightDoc) {
    await this.es.index({
      index: INDEX,
      id: doc.flightId,
      document: doc,
    });
    this.logger.log(`Flight ${doc.flightId} indexed`);
  }

  /** Cập nhật số ghế trống khi inventory thay đổi */
  async updateAvailableSeats(flightId: string, delta: number) {
    // Dùng Painless script để increment/decrement atomic
    await this.es.update({
      index: INDEX,
      id: flightId,
      script: {
        source: `
          ctx._source.availableSeats += params.delta;
          if (ctx._source.availableSeats < 0) ctx._source.availableSeats = 0;
        `,
        params: { delta },
      },
      upsert: { availableSeats: Math.max(0, delta) },
    });
  }

  /** Cập nhật giá khi pricing-service thay đổi */
  async updatePrice(flightId: string, price: number) {
    await this.es.update({
      index: INDEX,
      id: flightId,
      doc: { price },
      upsert: { price },
    });
    this.logger.log(`Flight ${flightId} price updated → ${price}`);
  }

  /** Seed data để test */
  async seedSampleFlights() {
    const flights: FlightDoc[] = [
      {
        flightId: '00000001-0000-4000-8000-000000000001',
        flightNo: 'VN123',
        airline: 'Vietnam Airlines',
        origin: 'SGN',
        destination: 'HAN',
        departureAt: '2025-12-20T07:00:00+07:00',
        arrivalAt: '2025-12-20T09:10:00+07:00',
        price: 850000,
        currency: 'VND',
        availableSeats: 120,
        totalSeats: 150,
      },
      {
        flightId: '00000002-0000-4000-8000-000000000002',
        flightNo: 'VJ456',
        airline: 'VietJet Air',
        origin: 'SGN',
        destination: 'HAN',
        departureAt: '2025-12-20T10:30:00+07:00',
        arrivalAt: '2025-12-20T12:40:00+07:00',
        price: 650000,
        currency: 'VND',
        availableSeats: 80,
        totalSeats: 180,
      },
    ];

    for (const f of flights) {
      await this.upsertFlight(f);
    }

    await this.es.indices.refresh({ index: INDEX });
    this.logger.log('Sample flights seeded');
  }
}
