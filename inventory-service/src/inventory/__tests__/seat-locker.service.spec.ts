import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SeatLockerService } from '../seat-locker.service';
import { Seat } from '../entities/seat.entity';

const redisMock = {
  set: jest.fn(),
  eval: jest.fn(),
  del: jest.fn(),
};

jest.mock('ioredis', () => jest.fn().mockImplementation(() => redisMock));

describe('SeatLockerService', () => {
  let service: SeatLockerService;
  let seatRepo: {
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    seatRepo = {
      findOneBy: jest.fn(),
      create: jest.fn((x: Partial<Seat>) => ({ id: 'new-seat', ...x })),
      save: jest.fn(async (s: Seat) => s),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn(async (fn: (m: { save: jest.Mock }) => Promise<void>) => {
        const manager = { save: jest.fn().mockResolvedValue(undefined) };
        await fn(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeatLockerService,
        { provide: getRepositoryToken(Seat), useValue: seatRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(SeatLockerService);
  });

  it('lock returns success when Redis SET NX returns OK', async () => {
    redisMock.set.mockResolvedValue('OK');
    seatRepo.findOneBy.mockResolvedValue(null);

    const result = await service.lock('b1', 'f1', '10A', 60);

    expect(result.success).toBe(true);
    expect(result.lockToken).toBeDefined();
    expect(seatRepo.save).toHaveBeenCalled();
  });

  it('lock fails when Redis key already exists', async () => {
    redisMock.set.mockResolvedValue(null);

    const result = await service.lock('b1', 'f1', '10A');

    expect(result.success).toBe(false);
    expect(result.reason).toBe('Seat already locked or booked');
    expect(seatRepo.save).not.toHaveBeenCalled();
  });

  it('lock fails when seat already BOOKED and releases Redis lock', async () => {
    redisMock.set.mockResolvedValue('OK');
    seatRepo.findOneBy.mockResolvedValue({
      id: 's1',
      flightId: 'f1',
      seatNo: '10A',
      status: 'BOOKED',
    });
    redisMock.eval.mockResolvedValue(1);

    const result = await service.lock('b1', 'f1', '10A');

    expect(result.success).toBe(false);
    expect(result.reason).toBe('Seat already booked');
    expect(redisMock.eval).toHaveBeenCalled();
  });

  it('release clears Redis and updates DB', async () => {
    redisMock.eval.mockResolvedValue(1);
    await service.release('f1', '10A', 'tok');
    expect(redisMock.eval).toHaveBeenCalled();
    expect(seatRepo.update).toHaveBeenCalledWith(
      { flightId: 'f1', seatNo: '10A', lockToken: 'tok' },
      expect.objectContaining({ status: 'AVAILABLE' }),
    );
  });

  it('confirm returns true when seat matches lockToken', async () => {
    const seat = {
      id: 's1',
      flightId: 'f1',
      seatNo: '10A',
      lockToken: 'tok',
      status: 'LOCKED' as const,
      version: 1,
    };
    seatRepo.findOneBy.mockResolvedValue(seat);
    redisMock.del.mockResolvedValue(1);

    const ok = await service.confirm('f1', '10A', 'tok');

    expect(ok).toBe(true);
    expect(redisMock.del).toHaveBeenCalled();
  });

  it('confirm returns false when seat not found', async () => {
    seatRepo.findOneBy.mockResolvedValue(null);
    expect(await service.confirm('f1', '10A', 'bad')).toBe(false);
  });

  it('releaseExpiredSeats updates expired LOCKED seats', async () => {
    const expiredSeat = {
      id: 'e1',
      flightId: 'f1',
      seatNo: '02B',
    };
    seatRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([expiredSeat]),
    });

    await service.releaseExpiredSeats();

    expect(seatRepo.update).toHaveBeenCalledWith('e1', expect.objectContaining({ status: 'AVAILABLE' }));
  });
});
