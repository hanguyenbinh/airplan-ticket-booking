jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn(),
}));

import { Client } from '@elastic/elasticsearch';
import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from '../search.service';

const mockEs = {
  indices: {
    exists: jest.fn(),
    create: jest.fn(),
  },
  search: jest.fn(),
  index: jest.fn(),
  update: jest.fn(),
};

describe('SearchService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (Client as unknown as jest.Mock).mockImplementation(() => mockEs);
    mockEs.indices.exists.mockResolvedValue(true);
  });

  it('searchFlights maps ES hits to data and applies origin filter', async () => {
    mockEs.search.mockResolvedValue({
      hits: {
        hits: [
          {
            _source: {
              flightId: 'f1',
              flightNo: 'VN1',
              airline: 'VN',
              origin: 'SGN',
              destination: 'HAN',
              departureAt: '2025-12-20T07:00:00+07:00',
              arrivalAt: '2025-12-20T09:00:00+07:00',
              price: 100,
              currency: 'VND',
              availableSeats: 10,
              totalSeats: 150,
            },
          },
        ],
        total: 1,
      },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchService],
    }).compile();
    const service = module.get(SearchService);
    await service.onModuleInit();

    const result = await service.searchFlights({ origin: 'SGN' });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(mockEs.search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: {
          bool: {
            must: [{ term: { origin: 'SGN' } }],
          },
        },
      }),
    );
  });

  it('upsertFlight calls client.index with document', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchService],
    }).compile();
    const service = module.get(SearchService);
    await service.onModuleInit();

    const doc = {
      flightId: 'id1',
      flightNo: 'X',
      airline: 'A',
      origin: 'SGN',
      destination: 'DAD',
      departureAt: '2025-01-01T00:00:00Z',
      arrivalAt: '2025-01-01T02:00:00Z',
      price: 1,
      currency: 'VND',
      availableSeats: 1,
      totalSeats: 2,
    };
    await service.upsertFlight(doc);

    expect(mockEs.index).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'id1',
        document: doc,
      }),
    );
  });

  it('updateAvailableSeats calls update with script', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchService],
    }).compile();
    const service = module.get(SearchService);
    await service.onModuleInit();

    await service.updateAvailableSeats('fid', -1);

    expect(mockEs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'fid',
        script: expect.objectContaining({ params: { delta: -1 } }),
      }),
    );
  });
});
