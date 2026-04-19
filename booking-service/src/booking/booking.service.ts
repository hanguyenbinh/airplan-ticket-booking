import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from './entities/booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingSaga } from './saga/booking.saga';

@Injectable()
export class BookingService {
  constructor(
    @InjectRepository(Booking) private readonly repo: Repository<Booking>,
    private readonly saga: BookingSaga,
  ) {}

  async create(dto: CreateBookingDto): Promise<Booking> {
    const booking = this.repo.create({
      ...dto,
      status: 'INITIATED',
      sagaState: { step: 'STARTED' },
    });
    await this.repo.save(booking);

    // Saga chạy bất đồng bộ — không block response
    setImmediate(() => this.saga.start(booking));

    return booking;
  }

  async findOne(id: string): Promise<Booking> {
    const booking = await this.repo.findOneBy({ id });
    if (!booking) throw new NotFoundException(`Booking ${id} not found`);
    return booking;
  }

  async findAll(): Promise<Booking[]> {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: 50 });
  }
}
