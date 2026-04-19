import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { PricingService } from '../pricing.service';
import { FlightPrice } from '../entities/flight-price.entity';

describe('PricingService', () => {
  let service: PricingService;
  let repo: jest.Mocked<Pick<Repository<FlightPrice>, 'findOneBy' | 'create' | 'save'>>;

  beforeEach(async () => {
    repo = {
      findOneBy: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        { provide: getRepositoryToken(FlightPrice), useValue: repo },
      ],
    }).compile();

    service = module.get(PricingService);
  });

  it('onInventoryChanged creates default row when missing (no emit if price unchanged)', async () => {
    const flightId = '00000000-0000-4000-8000-0000000000aa';
    repo.findOneBy.mockResolvedValue(null);
    const created = {
      flightId,
      basePrice: 850000,
      currentPrice: 850000,
      bookedSeats: 0,
      totalSeats: 150,
    } as FlightPrice;
    repo.create.mockReturnValue(created);
    repo.save.mockImplementation(async (r: DeepPartial<FlightPrice>) => r as FlightPrice);

    const out = await service.onInventoryChanged(flightId, false);

    expect(out).toBeNull();
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ bookedSeats: 1 }));
  });

  it('onInventoryChanged returns emit when occupancy crosses pricing tier', async () => {
    const flightId = '00000000-0000-4000-8000-0000000000ff';
    repo.findOneBy.mockResolvedValue({
      flightId,
      basePrice: 1_000_000,
      currentPrice: 1_000_000,
      bookedSeats: 119,
      totalSeats: 150,
    } as FlightPrice);
    repo.save.mockImplementation(async (r: DeepPartial<FlightPrice>) => r as FlightPrice);

    const out = await service.onInventoryChanged(flightId, false);

    expect(out).toEqual({ flightId, price: 2_000_000 });
  });

  it('onInventoryChanged with available=true decreases bookedSeats', async () => {
    const flightId = '00000000-0000-4000-8000-0000000000bb';
    const existing = {
      flightId,
      basePrice: 850000,
      currentPrice: 1020000,
      bookedSeats: 50,
      totalSeats: 150,
    } as FlightPrice;
    repo.findOneBy.mockResolvedValue(existing);
    repo.save.mockImplementation(async (r: DeepPartial<FlightPrice>) => r as FlightPrice);

    await service.onInventoryChanged(flightId, true);

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ bookedSeats: 49 }),
    );
  });

  it('onInventoryChanged returns null when price unchanged after save', async () => {
    const flightId = '00000000-0000-4000-8000-0000000000cc';
    const existing = {
      flightId,
      basePrice: 1000,
      currentPrice: 1000,
      bookedSeats: 0,
      totalSeats: 150,
    } as FlightPrice;
    repo.findOneBy.mockResolvedValue(existing);
    repo.save.mockImplementation(async (r: DeepPartial<FlightPrice>) => r as FlightPrice);

    const out = await service.onInventoryChanged(flightId, true);

    expect(out).toBeNull();
  });
});
