import {
  BookingConfirmedSchema,
  BookingFailedSchema,
  SeatConfirmFailedSchema,
} from '../schemas/kafka-messages';

describe('Kafka contract: booking outcomes', () => {
  it('BookingConfirmedSchema matches booking-service emit', () => {
    const payload = {
      bookingId: '00000000-0000-4000-8000-000000000021',
      passengerName: 'Nguyen Van A',
      flightId: '00000000-0000-4000-8000-000000000022',
      seatNo: '07F',
      totalAmount: 850000,
    };
    expect(BookingConfirmedSchema.safeParse(payload).success).toBe(true);
  });

  it('BookingFailedSchema for notification-service consumer', () => {
    const payload = {
      bookingId: '00000000-0000-4000-8000-000000000023',
      reason: 'timeout',
      passengerName: 'X',
    };
    expect(BookingFailedSchema.safeParse(payload).success).toBe(true);
  });

  it('SeatConfirmFailedSchema matches inventory emit', () => {
    const payload = {
      bookingId: '00000000-0000-4000-8000-000000000024',
      reason: 'Optimistic lock conflict or token mismatch',
    };
    expect(SeatConfirmFailedSchema.safeParse(payload).success).toBe(true);
  });
});
