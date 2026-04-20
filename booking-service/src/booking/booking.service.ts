import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from './entities/booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { BookingSaga } from './saga/booking.saga';
import { AvailableSeatsCacheService } from './available-seats-cache.service';

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    @InjectRepository(Booking) private readonly repo: Repository<Booking>,
    private readonly saga: BookingSaga,
    private readonly seatsCache: AvailableSeatsCacheService,
  ) {}

  async create(dto: CreateBookingDto): Promise<Booking> {
    if (!(await this.seatsCache.tryReserveSeatInCache(dto.flightId, dto.seatNo))) {
      throw new ConflictException(`Seat ${dto.seatNo} is locked in cache or not available for this flight`);
    }

    const booking = this.repo.create({
      ...dto,
      status: 'INITIATED',
      sagaState: { step: 'STARTED' },
    });
    try {
      await this.repo.save(booking);
    } catch (e) {
      await this.seatsCache.unreserveSeatInCache(dto.flightId, dto.seatNo);
      throw e;
    }

    void this.saga.start(booking).catch((e) => {
      this.logger.error(`saga.start failed for ${booking.id}: ${(e as Error)?.message}`);
      void this.seatsCache.unreserveSeatInCache(booking.flightId, booking.seatNo);
    });

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
