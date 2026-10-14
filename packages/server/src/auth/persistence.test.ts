import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { transaction } from './persistence.js';

function fixture() {
  const runner = {
    isTransactionActive: false,
    connect: vi.fn(async () => {}),
    startTransaction: vi.fn(async () => { runner.isTransactionActive = true; }),
    commitTransaction: vi.fn(async () => { runner.isTransactionActive = false; }),
    rollbackTransaction: vi.fn(async () => { runner.isTransactionActive = false; }),
    release: vi.fn(async () => {}),
  };
  const db = { createQueryRunner: () => runner } as unknown as DataSource;
  return { db, runner };
}

describe('transaction lifecycle', () => {
  it('returns the work result after committing with READ COMMITTED isolation', async () => {
    const { db, runner } = fixture();
    const result = { id: 'synthetic' };
    await expect(transaction(db, async r => {
      expect(r).toBe(runner);
      expect(r.isTransactionActive).toBe(true);
      return result;
    })).resolves.toBe(result);
    expect(runner.startTransaction).toHaveBeenCalledWith('READ COMMITTED');
    expect(runner.commitTransaction).toHaveBeenCalledOnce();
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalledOnce();
  });

  it.each(['connect', 'startTransaction'] as const)('releases after %s fails without invoking work', async phase => {
    const { db, runner } = fixture();
    const failure = new Error(phase);
    runner[phase].mockRejectedValueOnce(failure);
    const work = vi.fn(async () => {});
    await expect(transaction(db, work)).rejects.toBe(failure);
    expect(work).not.toHaveBeenCalled();
    expect(runner.commitTransaction).not.toHaveBeenCalled();
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalledOnce();
  });

  it('rolls back if transaction start fails after becoming active', async () => {
    const { db, runner } = fixture();
    const failure = new Error('start failed after activation');
    runner.startTransaction.mockImplementationOnce(async () => {
      runner.isTransactionActive = true;
      throw failure;
    });
    await expect(transaction(db, async () => {})).rejects.toBe(failure);
    expect(runner.rollbackTransaction).toHaveBeenCalledOnce();
    expect(runner.release).toHaveBeenCalledOnce();
  });

  it.each(['work', 'commit'] as const)('rolls back and releases after %s fails', async phase => {
    const { db, runner } = fixture();
    const failure = new Error(phase);
    if (phase === 'commit') runner.commitTransaction.mockRejectedValueOnce(failure);
    await expect(transaction(db, async () => {
      if (phase === 'work') throw failure;
    })).rejects.toBe(failure);
    expect(runner.rollbackTransaction).toHaveBeenCalledOnce();
    expect(runner.release).toHaveBeenCalledOnce();
  });

  it.each([false, true])('preserves the work failure when rollback fails (release also fails: %s)', async releaseFails => {
    const { db, runner } = fixture();
    const failure = new Error('operation failed');
    runner.rollbackTransaction.mockRejectedValueOnce(new Error('rollback failed'));
    if (releaseFails) runner.release.mockRejectedValueOnce(new Error('release failed'));
    await expect(transaction(db, async () => { throw failure; })).rejects.toBe(failure);
    expect(runner.release).toHaveBeenCalledOnce();
  });

  it.each(['connect', 'startTransaction', 'commitTransaction'] as const)('preserves the %s failure when release fails', async phase => {
    const { db, runner } = fixture();
    const failure = new Error(phase);
    runner[phase].mockRejectedValueOnce(failure);
    runner.release.mockRejectedValueOnce(new Error('release failed'));
    await expect(transaction(db, async () => {})).rejects.toBe(failure);
    expect(runner.release).toHaveBeenCalledOnce();
  });

  it('preserves even an undefined thrown value when cleanup fails', async () => {
    const { db, runner } = fixture();
    runner.release.mockRejectedValueOnce(new Error('release failed'));
    await expect(transaction(db, async () => { throw undefined; })).rejects.toBeUndefined();
  });

  it('does not roll back a transaction already ended by the work', async () => {
    const { db, runner } = fixture();
    const failure = new Error('after rollback');
    await expect(transaction(db, async r => {
      await r.rollbackTransaction();
      throw failure;
    })).rejects.toBe(failure);
    expect(runner.rollbackTransaction).toHaveBeenCalledOnce();
    expect(runner.release).toHaveBeenCalledOnce();
  });

  it('surfaces release failure after successful commit without retrying or rolling back', async () => {
    const { db, runner } = fixture();
    const failure = new Error('release failed');
    runner.release.mockRejectedValueOnce(failure);
    await expect(transaction(db, async () => 'result')).rejects.toBe(failure);
    expect(runner.commitTransaction).toHaveBeenCalledOnce();
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('preserves a commit failure when the transaction is no longer active', async () => {
    const { db, runner } = fixture();
    const failure = new Error('commit acknowledgement lost');
    runner.commitTransaction.mockImplementationOnce(async () => {
      runner.isTransactionActive = false;
      throw failure;
    });
    await expect(transaction(db, async () => {})).rejects.toBe(failure);
    expect(runner.rollbackTransaction).not.toHaveBeenCalled();
    expect(runner.release).toHaveBeenCalledOnce();
  });
});
