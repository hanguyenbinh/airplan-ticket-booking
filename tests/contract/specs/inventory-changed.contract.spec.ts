import { InventoryChangedSchema, PricingUpdatedSchema } from '../schemas/kafka-messages';

describe('Kafka contract: inventory & pricing', () => {
  it('InventoryChangedSchema (seat taken)', () => {
    const payload = {
      flightId: '00000000-0000-4000-8000-000000000011',
      seatNo: '05D',
      available: false,
    };
    expect(InventoryChangedSchema.safeParse(payload).success).toBe(true);
  });

  it('InventoryChangedSchema (seat released)', () => {
    const payload = {
      flightId: '00000000-0000-4000-8000-000000000012',
      seatNo: '06E',
      available: true,
    };
    expect(InventoryChangedSchema.safeParse(payload).success).toBe(true);
  });

  it('PricingUpdatedSchema matches pricing-service emit', () => {
    const payload = { flightId: '00000000-0000-4000-8000-000000000013', price: 1020000 };
    expect(PricingUpdatedSchema.safeParse(payload).success).toBe(true);
  });
});
