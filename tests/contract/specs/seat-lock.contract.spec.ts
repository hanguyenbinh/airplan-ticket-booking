import {
  SeatLockSchema,
  SeatLockedSchema,
  SeatLockFailedSchema,
  SeatConfirmSchema,
  SeatConfirmedSchema,
  SeatReleaseSchema,
} from '../schemas/kafka-messages';

describe('Kafka contract: seat lock flow', () => {
  it('SeatLockSchema accepts producer payload from booking saga', () => {
    const payload = {
      bookingId: '00000000-0000-4000-8000-000000000001',
      flightId: '00000000-0000-4000-8000-000000000002',
      seatNo: '12F',
      ttlSeconds: 600,
    };
    expect(SeatLockSchema.safeParse(payload).success).toBe(true);
  });

  it('SeatLockedSchema matches inventory emit shape', () => {
    const payload = {
      bookingId: '00000000-0000-4000-8000-000000000003',
      lockToken: '00000000-0000-4000-8000-000000000004',
    };
    expect(SeatLockedSchema.safeParse(payload).success).toBe(true);
  });

  it('SeatLockFailedSchema matches inventory failure emit', () => {
    const payload = {
      bookingId: '00000000-0000-4000-8000-000000000005',
      reason: 'Seat already locked or booked',
    };
    expect(SeatLockFailedSchema.safeParse(payload).success).toBe(true);
  });

  it('SeatConfirmSchema accepts booking saga confirm payload', () => {
    const payload = {
      bookingId: '00000000-0000-4000-8000-000000000006',
      flightId: '00000000-0000-4000-8000-000000000007',
      seatNo: '03B',
      lockToken: '00000000-0000-4000-8000-000000000008',
    };
    expect(SeatConfirmSchema.safeParse(payload).success).toBe(true);
  });

  it('SeatConfirmedSchema matches inventory success emit', () => {
    expect(
      SeatConfirmedSchema.safeParse({ bookingId: '00000000-0000-4000-8000-000000000009' }).success,
    ).toBe(true);
  });

  it('SeatReleaseSchema matches compensate payload', () => {
    const payload = {
      bookingId: '00000000-0000-4000-8000-00000000000a',
      flightId: '00000000-0000-4000-8000-00000000000b',
      seatNo: '04C',
      lockToken: '00000000-0000-4000-8000-00000000000c',
    };
    expect(SeatReleaseSchema.safeParse(payload).success).toBe(true);
  });
});
