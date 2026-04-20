import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SeatLockerService } from '../seat-locker.service';
import { Seat } from '../entities/seat.entity';

const redisMock = {
  set: jest.fn(),
  eval: jest.fn(),
  del: jest.fn(),
};

jest.mock('ioredis', () => jest.fn().mockImplementation(() => redisMock));

/** Chainable mock for an UpdateQueryBuilder; resolves execute() with `affected` rows. */
function makeUpdateQb(affected: number) {
  const exec = jest.fn().mockResolvedValue({ affected, raw: [] });
  const chain: Record<string, jest.Mock> = {};
  chain.update = jest.fn().mockReturnValue(chain);
  chain.set = jest.fn().mockReturnValue(chain);
  chain.where = jest.fn().mockReturnValue(chain);
  chain.execute = exec;
  return chain;
}

describe('SeatLockerService (single-update fast path)', () => {
  let service: SeatLockerService;
  let seatRepo: {
    findOneBy: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    seatRepo = {
      findOneBy: jest.fn(),
      insert: jest.fn().mockResolvedValue(undefined),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeatLockerService,
        { provide: getRepositoryToken(Seat), useValue: seatRepo },
      ],
    }).compile();

    service = module.get(SeatLockerService);
  });

  it('lock hot path: SETNX OK + 1-row UPDATE → success in 2 RTTs', async () => {
    redisMock.set.mockResolvedValue('OK');
    seatRepo.createQueryBuilder.mockReturnValueOnce(makeUpdateQb(1));

    const r = await service.lock('b1', 'f1', '10A', 60);

    expect(r.success).toBe(true);
    expect(r.lockToken).toBeDefined();
    expect(seatRepo.findOneBy).not.toHaveBeenCalled();
    expect(seatRepo.insert).not.toHaveBeenCalled();
  });

  it('lock fails fast when Redis SETNX rejects', async () => {
    redisMock.set.mockResolvedValue(null);
    const r = await service.lock('b1', 'f1', '10A');
    expect(r.success).toBe(false);
    expect(r.reason).toBe('Seat already locked or booked');
    expect(seatRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('lock cold path: 0 rows updated and seat does not exist → INSERT, success', async () => {
    redisMock.set.mockResolvedValue('OK');
    seatRepo.createQueryBuilder.mockReturnValueOnce(makeUpdateQb(0));
    seatRepo.findOneBy.mockResolvedValue(null);

    const r = await service.lock('b1', 'f1', '10A');

    expect(seatRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({ flightId: 'f1', seatNo: '10A', status: 'LOCKED' }),
    );
    expect(r.success).toBe(true);
  });

  it('lock cold path: seat exists with status BOOKED → fail and release Redis', async () => {
    redisMock.set.mockResolvedValue('OK');
    seatRepo.createQueryBuilder.mockReturnValueOnce(makeUpdateQb(0));
    seatRepo.findOneBy.mockResolvedValue({ status: 'BOOKED' });
    redisMock.eval.mockResolvedValue(1);

    const r = await service.lock('b1', 'f1', '10A');

    expect(r.success).toBe(false);
    expect(r.reason).toBe('Seat already booked');
    expect(redisMock.eval).toHaveBeenCalled();
  });

  it('lock cold path: seat exists with status LOCKED (race) → fail and release Redis', async () => {
    redisMock.set.mockResolvedValue('OK');
    seatRepo.createQueryBuilder.mockReturnValueOnce(makeUpdateQb(0));
    seatRepo.findOneBy.mockResolvedValue({ status: 'LOCKED' });
    redisMock.eval.mockResolvedValue(1);

    const r = await service.lock('b1', 'f1', '10A');

    expect(r.success).toBe(false);
    expect(r.reason).toBe('Seat not available');
  });

  it('release clears Redis and updates DB row by lockToken', async () => {
    redisMock.eval.mockResolvedValue(1);
    await service.release('f1', '10A', 'tok');
    expect(redisMock.eval).toHaveBeenCalled();
    expect(seatRepo.update).toHaveBeenCalledWith(
      { flightId: 'f1', seatNo: '10A', lockToken: 'tok' },
      expect.objectContaining({ status: 'AVAILABLE' }),
    );
  });

  it('confirm: 1 conditional UPDATE → BOOKED + Redis del', async () => {
    seatRepo.createQueryBuilder.mockReturnValueOnce(makeUpdateQb(1));
    redisMock.del.mockResolvedValue(1);

    const ok = await service.confirm('f1', '10A', 'tok');

    expect(ok).toBe(true);
    expect(redisMock.del).toHaveBeenCalledWith('seat:lock:f1:10A');
  });

  it('confirm returns false when no row affected (token mismatch)', async () => {
    seatRepo.createQueryBuilder.mockReturnValueOnce(makeUpdateQb(0));
    expect(await service.confirm('f1', '10A', 'bad')).toBe(false);
    expect(redisMock.del).not.toHaveBeenCalled();
  });

  it('releaseExpiredSeats updates expired LOCKED seats', async () => {
    const expiredSeat = { id: 'e1', flightId: 'f1', seatNo: '02B' };
    seatRepo.createQueryBuilder.mockReturnValueOnce({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([expiredSeat]),
    });

    await service.releaseExpiredSeats();

    expect(seatRepo.update).toHaveBeenCalledWith('e1', expect.objectContaining({ status: 'AVAILABLE' }));
  });
});
