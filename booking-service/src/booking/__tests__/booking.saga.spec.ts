import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookingSaga } from '../saga/booking.saga';
import { Booking } from '../entities/booking.entity';
import { KafkaProducer } from '../../clients/kafka.client';
import { AvailableSeatsCacheService } from '../available-seats-cache.service';

/**
 * The new saga uses a fluent UpdateQueryBuilder for every step (no findOneByOrFail).
 * This helper builds a chainable mock that resolves to the shape `mergeSagaUpdate` expects.
 */
function makeQbMock(rawRow: Partial<Booking> | null) {
  const exec = jest.fn().mockResolvedValue({
    affected: rawRow ? 1 : 0,
    raw: rawRow ? [rawRow] : [],
  });
  const chain: Record<string, jest.Mock> = {};
  chain.update = jest.fn().mockReturnValue(chain);
  chain.set = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.returning = jest.fn().mockReturnValue(chain);
  chain.execute = exec;
  return { chain, exec };
}

describe('BookingSaga (query-builder, single-update per step)', () => {
  let saga: BookingSaga;
  let repo: jest.Mocked<Pick<Repository<Booking>, 'createQueryBuilder'>>;
  let kafka: { emit: jest.Mock };
  let seatsCache: { unreserveSeatInCache: jest.Mock };

  const flightId = '00000000-0000-4000-8000-0000000000bb';
  const seatNo = '12F';
  const bookingId = '00000000-0000-4000-8000-0000000000aa';

  beforeEach(async () => {
    process.env.PAYMENT_MOCK_DELAY_MS = '0';
    jest.useFakeTimers();
    repo = { createQueryBuilder: jest.fn() };
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

  it('onSeatLocked: 1 conditional UPDATE → status=SEAT_LOCKED, then schedules onPaymentCompleted', async () => {
    const lockToken = 'tok-uuid';
    const lockRequestedAt = '2026-01-01T00:00:00.000Z';

    const stepUpdate = makeQbMock({
      id: bookingId,
      flightId,
      seatNo,
      sagaState: { step: 'CHARGING_PAYMENT', lockToken, lockRequestedAt },
    } as Partial<Booking>);
    const lockRoundTripUpdate = makeQbMock({} as Partial<Booking>);
    const paymentStepUpdate = makeQbMock({
      id: bookingId,
      flightId,
      seatNo,
      sagaState: { step: 'CONFIRMING_SEAT', lockToken },
    } as Partial<Booking>);

    repo.createQueryBuilder
      .mockReturnValueOnce(stepUpdate.chain as never)
      .mockReturnValueOnce(lockRoundTripUpdate.chain as never)
      .mockReturnValueOnce(paymentStepUpdate.chain as never);

    jest.setSystemTime(new Date('2026-01-01T00:00:02.500Z'));
    await saga.onSeatLocked(bookingId, lockToken);

    // 1st call: conditional UPDATE for SEAT_LOCKED
    expect(stepUpdate.chain.update).toHaveBeenCalledWith(Booking);
    expect(stepUpdate.chain.set).toHaveBeenCalled();
    expect(stepUpdate.chain.where).toHaveBeenCalledWith(
      'id = :id AND status IN (:...allowed)',
      { id: bookingId, allowed: ['INITIATED'] },
    );

    // 2nd call: lockRoundTripMs follow-up (only when lockRequestedAt was present)
    expect(lockRoundTripUpdate.chain.execute).toHaveBeenCalled();

    // After setImmediate fires, onPaymentCompleted runs and emits seat.confirm.
    await jest.runAllTimersAsync();

    expect(kafka.emit).toHaveBeenCalledWith('seat.confirm', {
      bookingId,
      flightId,
      seatNo,
      lockToken,
    });
  });

  it('onSeatConfirmed: 1 conditional UPDATE then emits booking.confirmed using returned row', async () => {
    const qb = makeQbMock({
      id: bookingId,
      flightId,
      seatNo,
      passengerName: 'P',
      totalAmount: 500000,
      sagaState: { step: 'DONE' },
    } as Partial<Booking>);
    repo.createQueryBuilder.mockReturnValueOnce(qb.chain as never);

    await saga.onSeatConfirmed(bookingId);

    expect(qb.chain.where).toHaveBeenCalledWith(
      'id = :id AND status IN (:...allowed)',
      { id: bookingId, allowed: ['PAYMENT_PROCESSING'] },
    );
    expect(kafka.emit).toHaveBeenCalledWith('booking.confirmed', {
      bookingId,
      passengerName: 'P',
      flightId,
      seatNo,
      totalAmount: 500000,
    });
  });

  it('compensate: marks FAILED, emits seat.release when lockToken exists, unreserves cache', async () => {
    const qb = makeQbMock({
      id: bookingId,
      flightId,
      seatNo,
      sagaState: { step: 'COMPENSATED', lockToken: 'tok-uuid', lockRequestedAt: '2026-01-01T00:00:00.000Z' },
    } as Partial<Booking>);
    repo.createQueryBuilder.mockReturnValueOnce(qb.chain as never);
    jest.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));

    await saga.compensate(bookingId, 'Seat lock failed: x');

    expect(kafka.emit).toHaveBeenCalledWith('seat.release', {
      bookingId,
      flightId,
      seatNo,
      lockToken: 'tok-uuid',
    });
    expect(seatsCache.unreserveSeatInCache).toHaveBeenCalledWith(flightId, seatNo);
  });

  it('compensate without lockToken still unreserves cache and skips seat.release', async () => {
    const qb = makeQbMock({
      id: bookingId,
      flightId,
      seatNo,
      sagaState: { step: 'COMPENSATED', lockRequestedAt: '2026-01-01T00:00:00.000Z' },
    } as Partial<Booking>);
    repo.createQueryBuilder.mockReturnValueOnce(qb.chain as never);

    await saga.compensate(bookingId, 'Seat lock failed: busy');

    expect(kafka.emit).not.toHaveBeenCalledWith('seat.release', expect.anything());
    expect(seatsCache.unreserveSeatInCache).toHaveBeenCalledWith(flightId, seatNo);
  });

  it('mergeSagaUpdate returns null on no rows affected → handler logs and exits', async () => {
    const qb = makeQbMock(null);
    repo.createQueryBuilder.mockReturnValueOnce(qb.chain as never);

    await saga.onSeatConfirmed(bookingId);

    expect(kafka.emit).not.toHaveBeenCalled();
  });
});
