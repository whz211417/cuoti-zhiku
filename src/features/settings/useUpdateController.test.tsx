import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateClient, UpdateDescriptor } from './updateClient';
import { LAST_UPDATE_CHECK_KEY, useUpdateController } from './useUpdateController';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const update = (overrides: Partial<UpdateDescriptor> = {}): UpdateDescriptor => ({
  version: '0.5.2',
  notes: '更顺手',
  downloadAndInstall: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const client = (overrides: Partial<UpdateClient> = {}): UpdateClient => ({
  getCurrentVersion: vi.fn().mockResolvedValue('0.5.1'),
  check: vi.fn().mockResolvedValue(null),
  ...overrides,
});

describe('useUpdateController', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs one eligible automatic check after 15 seconds', async () => {
    vi.useFakeTimers();
    const updateClient = client();
    const now = () => new Date('2026-09-20T12:00:00.000Z');
    const { result } = renderHook(() => useUpdateController(updateClient, { now }));

    await act(async () => undefined);
    expect(updateClient.check).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(14_999));
    expect(updateClient.check).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1));

    expect(updateClient.check).toHaveBeenCalledOnce();
    expect(result.current.state).toMatchObject({ status: 'current', currentVersion: '0.5.1' });
    expect(localStorage.getItem(LAST_UPDATE_CHECK_KEY)).toBe('2026-09-20T12:00:00.000Z');
  });

  it('skips the automatic check inside 24 hours but allows a manual check', async () => {
    vi.useFakeTimers();
    localStorage.setItem(LAST_UPDATE_CHECK_KEY, '2026-09-20T11:00:00.000Z');
    const updateClient = client();
    const { result } = renderHook(() => useUpdateController(updateClient, {
      now: () => new Date('2026-09-20T12:00:00.000Z'),
    }));

    await act(async () => vi.advanceTimersByTimeAsync(15_000));
    expect(updateClient.check).not.toHaveBeenCalled();
    await act(async () => result.current.checkNow());

    expect(updateClient.check).toHaveBeenCalledOnce();
    expect(result.current.state.status).toBe('current');
  });

  it('coalesces concurrent checks', async () => {
    const pending = deferred<UpdateDescriptor | null>();
    const updateClient = client({ check: vi.fn(() => pending.promise) });
    const { result } = renderHook(() => useUpdateController(updateClient));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.checkNow();
      second = result.current.checkNow();
    });
    expect(updateClient.check).toHaveBeenCalledOnce();
    pending.resolve(null);
    await act(async () => Promise.all([first, second]));
  });

  it('keeps offline failures retryable without advancing the throttle', async () => {
    const check = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(null);
    const updateClient = client({ check });
    const { result } = renderHook(() => useUpdateController(updateClient, {
      now: () => new Date('2026-09-20T12:00:00.000Z'),
    }));

    await act(async () => result.current.checkNow());
    expect(result.current.state).toMatchObject({ status: 'error', message: '暂时无法检查更新，请稍后重试。' });
    expect(localStorage.getItem(LAST_UPDATE_CHECK_KEY)).toBeNull();
    await act(async () => result.current.checkNow());

    expect(check).toHaveBeenCalledTimes(2);
    expect(result.current.state.status).toBe('current');
  });

  it('closes an available native update when unmounted', async () => {
    const next = update();
    const updateClient = client({ check: vi.fn().mockResolvedValue(next) });
    const { result, unmount } = renderHook(() => useUpdateController(updateClient));

    await act(async () => result.current.checkNow());
    await waitFor(() => expect(result.current.state.status).toBe('available'));
    unmount();

    await waitFor(() => expect(next.close).toHaveBeenCalledOnce());
  });
});
