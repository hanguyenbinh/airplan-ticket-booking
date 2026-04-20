import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookingSaga } from '../saga/booking.saga';
import { Booking } from '../entities/booking.entity';
import { KafkaProducer } from '../../clients/kafka.client';
import { AvailableSeatsCacheService } from '../available-seats-cache.service';

describe('BookingSaga', () => {
  let saga: BookingSaga;
  let repo: jest.Mocked<Pick<Repository<Booking>, 'findOneByOrFail' | 'update'>>;
  let kafka: { emit: jest.Mock };
  let seatsCache: { unreserveSeatInCache: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers();
    repo = {
      findOneByOrFail: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };
    kafka = { emit: jest.fn() };
    seatsCache = { unreserveSeatInCache: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingSaga,
        { provide: getRepositoryToken(Booking), useValue: repo },
        { provide: KafkaProducer, useValue: kafka },
        { provide: AvailableSeatsCacheService, useValue: seatsCache },
      ],
    }).compile();

    saga = module.get(BookingSaga);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('start emits seat.lock with payload', async () => {
    const booking = {
      id: '00000000-0000-4000-8000-0000000000aa',
      flightId: '00000000-0000-4000-8000-0000000000bb',
      seatNo: '12F',
      passengerName: 'A',
      totalAmount: 100,
      status: 'INITIATED' as const,
      sagaState: { step: 'STARTED' },
    } as Booking;

    await saga.start(booking);

    expect(repo.update).toHaveBeenCalledWith(
      booking.id,
      expect.objectContaining({
        sagaState: expect.objectContaining({
          step: 'LOCKING_SEAT',
          lockRequestedAt: expect.any(String),
        }),
      }),
    );
    expect(kafka.emit).toHaveBeenCalledWith('seat.lock', {
      bookingId: booking.id,
      flightId: booking.flightId,
      seatNo: booking.seatNo,
      ttlSeconds: 600,
    });
  });

  it('onSeatLocked advances state and after timer emits seat.confirm', async () => {
    const bookingId = '00000000-0000-4000-8000-0000000000cc';
    const lockToken = '00000000-0000-4000-8000-0000000000dd';
    const flightId = '00000000-0000-4000-8000-0000000000ee';
    const lockRequestedAt = '2020-01-01T00:00:00.000Z';
    jest.setSystemTime(new Date('2020-01-01T00:00:02.500Z'));
    repo.findOneByOrFail
      .mockResolvedValueOnce({
        id: bookingId,
        flightId,
        seatNo: '03B',
        sagaState: { step: 'LOCKING_SEAT', lockRequestedAt },
      } as Booking)
      .mockResolvedValueOnce({
        id: bookingId,
        flightId,
        seatNo: '03B',
        sagaState: { step: 'CHARGING_PAYMENT', lockToken, lockRoundTripMs: 2500 },
      } as Booking);

    await saga.onSeatLocked(bookingId, lockToken);

    expect(repo.update).toHaveBeenCalledWith(
      bookingId,
      expect.objectContaining({
        sagaState: expect.objectContaining({
          step: 'CHARGING_PAYMENT',
          lockToken,
          lockRoundTripMs: 2500,
          lockRequestedAt,
        }),
      }),
    );
    expect(repo.update).toHaveBeenCalledWith(bookingId, { status: 'SEAT_LOCKED' });

    expect(kafka.emit).not.toHaveBeenCalledWith(
      'seat.confirm',
      expect.anything(),
    );

    await jest.advanceTimersByTimeAsync(100);

    expect(kafka.emit).toHaveBeenCalledWith('seat.confirm', {
      bookingId,
      flightId,
      seatNo: '03B',
      lockToken,
    });
  });

  it('onSeatConfirmed sets CONFIRMED and emits booking.confirmed', async () => {
    const bookingId = '00000000-0000-4000-8000-0000000000ff';
    const booking = {
      id: bookingId,
      passengerName: 'P',
      flightId: '00000000-0000-4000-8000-000000000011',
      seatNo: '04C',
      totalAmount: 500000,
      sagaState: { step: 'CONFIRMING_SEAT', lockRoundTripMs: 99 },
    } as Booking;
    repo.findOneByOrFail.mockResolvedValue(booking);

    await saga.onSeatConfirmed(bookingId);

    expect(repo.update).toHaveBeenCalledWith(bookingId, {
      status: 'CONFIRMED',
      sagaState: { ...booking.sagaState, step: 'DONE' },
    });
    expect(kafka.emit).toHaveBeenCalledWith('booking.confirmed', {
      bookingId,
      passengerName: 'P',
      flightId: booking.flightId,
      seatNo: booking.seatNo,
      totalAmount: booking.totalAmount,
    });
  });

  it('compensate emits seat.release when lockToken exists and marks FAILED', async () => {
    const bookingId = '00000000-0000-4000-8000-000000000022';
    const lockRequestedAt = '2020-06-01T00:00:00.000Z';
    jest.setSystemTime(new Date('2020-06-01T00:00:01.000Z'));
    const booking = {
      id: bookingId,
      flightId: '00000000-0000-4000-8000-000000000033',
      seatNo: '05D',
      sagaState: { step: 'CHARGING_PAYMENT', lockToken: 'tok-uuid', lockRequestedAt },
    } as Booking;
    repo.findOneByOrFail.mockResolvedValue(booking);

    await saga.compensate(bookingId, 'Seat lock failed: x');

    expect(kafka.emit).toHaveBeenCalledWith('seat.release', {
      bookingId,
      flightId: booking.flightId,
      seatNo: booking.seatNo,
      lockToken: 'tok-uuid',
    });
    expect(repo.update).toHaveBeenCalledWith(bookingId, {
      status: 'FAILED',
      sagaState: { step: 'COMPENSATED', error: 'Seat lock failed: x', lockRoundTripMs: 1000 },
    });
    expect(seatsCache.unreserveSeatInCache).toHaveBeenCalledWith(booking.flightId, booking.seatNo);
  });

  it('compensate without lockToken still unreserves cache', async () => {
    const bookingId = '00000000-0000-4000-8000-000000000099';
    const booking = {
      id: bookingId,
      flightId: '00000000-0000-4000-8000-000000000088',
      seatNo: '06E',
      sagaState: { step: 'LOCKING_SEAT', lockRequestedAt: '2020-01-01T00:00:00.000Z' },
    } as Booking;
    repo.findOneByOrFail.mockResolvedValue(booking);

    await saga.compensate(bookingId, 'Seat lock failed: busy');

    expect(kafka.emit).not.toHaveBeenCalledWith('seat.release', expect.anything());
    expect(seatsCache.unreserveSeatInCache).toHaveBeenCalledWith(booking.flightId, booking.seatNo);
  });
});
