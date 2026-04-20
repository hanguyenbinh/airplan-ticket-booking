import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type BookingStatus =
  | 'INITIATED'
  | 'SEAT_LOCKED'
  | 'PAYMENT_PROCESSING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'CANCELLED';

@Entity('bookings')
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  flightId: string;

  @Column()
  seatNo: string;

  @Column()
  passengerName: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  totalAmount: number;

  @Column({ default: 'INITIATED' })
  status: BookingStatus;

  // Lưu trạng thái saga để recover khi crash
  @Column({ type: 'jsonb', nullable: true })
  sagaState: {
    step: string;
    /** ISO time when `seat.lock` was emitted (step 1). */
    lockRequestedAt?: string;
    /** ms from `lockRequestedAt` until `seat.locked` / `seat.lock.failed` (or compensate). */
    lockRoundTripMs?: number;
    lockToken?: string;
    paymentId?: string;
    error?: string;
  } | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
