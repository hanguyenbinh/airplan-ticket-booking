import { z } from 'zod';

/** booking-service → inventory-service */
export const SeatLockSchema = z.object({
  bookingId: z.string().uuid(),
  flightId: z.string().uuid(),
  seatNo: z.string().min(3).max(10),
  ttlSeconds: z.number().positive(),
});

/** inventory-service → booking-service */
export const SeatLockedSchema = z.object({
  bookingId: z.string().uuid(),
  lockToken: z.string().uuid(),
});

export const SeatLockFailedSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string(),
});

/** booking-service → inventory-service */
export const SeatConfirmSchema = z.object({
  bookingId: z.string().uuid(),
  flightId: z.string().uuid(),
  seatNo: z.string().min(3).max(10),
  lockToken: z.string().uuid().optional(),
});

/** inventory-service → booking-service */
export const SeatConfirmedSchema = z.object({
  bookingId: z.string().uuid(),
});

export const SeatConfirmFailedSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string(),
});

/** inventory-service → pricing-service & search-service */
export const InventoryChangedSchema = z.object({
  flightId: z.string().uuid(),
  seatNo: z.string().min(1).max(10),
  available: z.boolean(),
});

/** pricing-service → search-service */
export const PricingUpdatedSchema = z.object({
  flightId: z.string().uuid(),
  price: z.number().nonnegative(),
});

/** booking-service → notification-service */
export const BookingConfirmedSchema = z.object({
  bookingId: z.string().uuid(),
  passengerName: z.string(),
  flightId: z.string().uuid(),
  seatNo: z.string(),
  totalAmount: z.number(),
});

/** booking-service (compensate) — optional consumer */
export const BookingFailedSchema = z.object({
  bookingId: z.string().uuid(),
  reason: z.string(),
  passengerName: z.string().optional(),
});

/** booking-service → inventory-service */
export const SeatReleaseSchema = z.object({
  bookingId: z.string().uuid(),
  flightId: z.string().uuid(),
  seatNo: z.string().min(3).max(10),
  lockToken: z.string().uuid(),
});
