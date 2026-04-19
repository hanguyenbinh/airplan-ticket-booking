import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('flight_prices')
export class FlightPrice {
  @PrimaryColumn()
  flightId: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  basePrice: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  currentPrice: number;

  @Column({ default: 0 })
  bookedSeats: number;

  @Column({ default: 150 })
  totalSeats: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
