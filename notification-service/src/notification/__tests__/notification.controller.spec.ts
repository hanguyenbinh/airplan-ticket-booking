import { Test, TestingModule } from '@nestjs/testing';
import { NotificationController } from '../notification.controller';

describe('NotificationController', () => {
  let controller: NotificationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationController],
    }).compile();
    controller = module.get(NotificationController);
  });

  it('health returns service id', () => {
    expect(controller.health()).toEqual({
      status: 'ok',
      service: 'notification-service',
    });
  });

  it('onBookingConfirmed runs without throwing', () => {
    expect(() =>
      controller.onBookingConfirmed({
        bookingId: '00000000-0000-4000-8000-000000000001',
        passengerName: 'Test',
        flightId: '00000000-0000-4000-8000-000000000002',
        seatNo: '01A',
        totalAmount: 100000,
      }),
    ).not.toThrow();
  });
});
