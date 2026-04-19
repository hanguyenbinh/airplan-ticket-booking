import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';

export type SeatStatus = 'AVAILABLE' | 'LOCKED' | 'BOOKED';

@Entity('seats')
@Index(['flightId', 'seatNo'], { unique: true })
export class Seat {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  flightId: string;

  @Column()
  seatNo: string;

  @Column({ default: 'AVAILABLE' })
  status: SeatStatus;

  @Column({ type: 'varchar', nullable: true })
  lockToken: string | null;

  @Column({ type: 'varchar', nullable: true })
  lockedByBookingId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lockExpiresAt: Date | null;

  @VersionColumn()
  version: number; // Optimistic locking — TypeORM tự tăng khi update

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
