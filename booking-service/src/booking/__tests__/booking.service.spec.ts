import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookingService } from '../booking.service';
import { BookingSaga } from '../saga/booking.saga';
import { AvailableSeatsCacheService } from '../available-seats-cache.service';
import { Booking } from '../entities/booking.entity';

describe('BookingService', () => {
  let service: BookingService;
  let repo: jest.Mocked<Pick<Repository<Booking>, 'create' | 'save' | 'findOneBy' | 'find'>>;
  let saga: { start: jest.Mock };
  let seatsCache: {
    tryReserveSeatInCache: jest.Mock;
    unreserveSeatInCache: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      findOneBy: jest.fn(),
      find: jest.fn(),
    };
    saga = { start: jest.fn().mockResolvedValue(undefined) };
    seatsCache = {
      tryReserveSeatInCache: jest.fn().mockReturnValue(true),
      unreserveSeatInCache: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: getRepositoryToken(Booking), useValue: repo },
        { provide: BookingSaga, useValue: saga },
        { provide: AvailableSeatsCacheService, useValue: seatsCache },
      ],
    }).compile();

    service = module.get(BookingService);
  });

  it('create persists INITIATED and starts saga', async () => {
    const dto = {
      flightId: '00000000-0000-4000-8000-000000000001',
      seatNo: '01A',
      passengerName: 'Test User',
      totalAmount: 850000,
    };
    const saved = { id: 'booking-uuid-1', ...dto, status: 'INITIATED' as const, sagaState: { step: 'STARTED' } };
    repo.create.mockReturnValue(saved as Booking);
    repo.save.mockResolvedValue(saved as Booking);

    const result = await service.create(dto);

    expect(repo.create).toHaveBeenCalledWith({
      ...dto,
      status: 'INITIATED',
      sagaState: { step: 'STARTED' },
    });
    expect(repo.save).toHaveBeenCalledWith(saved);
    expect(result).toEqual(saved);

    expect(saga.start).toHaveBeenCalledWith(saved);
    expect(seatsCache.tryReserveSeatInCache).toHaveBeenCalledWith(dto.flightId, dto.seatNo);
  });

  it('create throws when seat is locked or unavailable in cache', async () => {
    seatsCache.tryReserveSeatInCache.mockResolvedValue(false);
    const dto = {
      flightId: '00000000-0000-4000-8000-000000000001',
      seatNo: '01A',
      passengerName: 'Test User',
      totalAmount: 850000,
    };
    await expect(service.create(dto)).rejects.toThrow(ConflictException);
    expect(seatsCache.tryReserveSeatInCache).toHaveBeenCalledWith(dto.flightId, dto.seatNo);
    expect(repo.save).not.toHaveBeenCalled();
    expect(saga.start).not.toHaveBeenCalled();
  });

  it('findOne throws when missing', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
  });

  it('findOne returns booking', async () => {
    const b = { id: 'x' } as Booking;
    repo.findOneBy.mockResolvedValue(b);
    await expect(service.findOne('x')).resolves.toBe(b);
  });
});
