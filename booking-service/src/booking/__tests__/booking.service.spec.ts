import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookingService } from '../booking.service';
import { AvailableSeatsCacheService } from '../available-seats-cache.service';
import { KafkaProducer } from '../../clients/kafka.client';
import { Booking } from '../entities/booking.entity';

describe('BookingService', () => {
  let service: BookingService;
  let repo: jest.Mocked<Pick<Repository<Booking>, 'create' | 'save' | 'findOneBy' | 'find'>>;
  let kafka: { emit: jest.Mock };
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
    kafka = { emit: jest.fn() };
    seatsCache = {
      tryReserveSeatInCache: jest.fn().mockResolvedValue(true),
      unreserveSeatInCache: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: getRepositoryToken(Booking), useValue: repo },
        { provide: AvailableSeatsCacheService, useValue: seatsCache },
        { provide: KafkaProducer, useValue: kafka },
      ],
    }).compile();

    service = module.get(BookingService);
  });

  it('create persists with sagaState=LOCKING_SEAT and emits seat.lock inline', async () => {
    const dto = {
      flightId: '00000000-0000-4000-8000-000000000001',
      seatNo: '01A',
      passengerName: 'Test User',
      totalAmount: 850000,
    };
    const saved = {
      id: 'booking-uuid-1',
      ...dto,
      status: 'INITIATED' as const,
      sagaState: { step: 'LOCKING_SEAT', lockRequestedAt: '2026-01-01T00:00:00.000Z' },
    };
    repo.create.mockReturnValue(saved as Booking);
    repo.save.mockResolvedValue(saved as Booking);

    const result = await service.create(dto);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ...dto,
        status: 'INITIATED',
        sagaState: expect.objectContaining({
          step: 'LOCKING_SEAT',
          lockRequestedAt: expect.any(String),
        }),
      }),
    );
    expect(repo.save).toHaveBeenCalledWith(saved);
    expect(result).toEqual(saved);

    expect(kafka.emit).toHaveBeenCalledWith('seat.lock', {
      bookingId: saved.id,
      flightId: dto.flightId,
      seatNo: dto.seatNo,
      ttlSeconds: 600,
    });
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
    expect(kafka.emit).not.toHaveBeenCalled();
  });

  it('create rejects a 2nd concurrent request for the same seat (in-flight dedupe)', async () => {
    const dto = {
      flightId: '00000000-0000-4000-8000-000000000001',
      seatNo: '02B',
      passengerName: 'A',
      totalAmount: 1,
    };
    const saved = { id: 'b-1', ...dto, status: 'INITIATED' as const, sagaState: null };
    repo.create.mockReturnValue(saved as Booking);
    let resolveSave!: (b: Booking) => void;
    repo.save.mockReturnValue(new Promise<Booking>((r) => (resolveSave = r)));

    const first = service.create(dto);
    expect(() => service.create(dto)).toThrow(ConflictException);

    resolveSave(saved as Booking);
    await first;
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
