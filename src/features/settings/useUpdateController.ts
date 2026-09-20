import { useCallback, useEffect, useRef, useState } from 'react';
import type { UpdateClient, UpdateDescriptor, UpdateProgress } from './updateClient';
import { shouldRunAutomaticCheck } from './updatePolicy';

export const LAST_UPDATE_CHECK_KEY = 'cuoti-zhiku:last-update-check';

export type UpdateState =
  | { status: 'idle'; currentVersion: string | null; lastCheckedAt: string | null }
  | { status: 'checking'; currentVersion: string | null; lastCheckedAt: string | null }
  | { status: 'current'; currentVersion: string; lastCheckedAt: string }
  | { status: 'available'; currentVersion: string; nextVersion: string; notes: string | null; lastCheckedAt: string }
  | { status: 'downloading'; currentVersion: string; nextVersion: string; progress: UpdateProgress }
  | { status: 'error'; currentVersion: string | null; message: string; lastCheckedAt: string | null };

type UpdateControllerOptions = {
  automaticDelayMs?: number;
  now?: () => Date;
  storage?: Storage;
};

const systemNow = () => new Date();

const readLastCheckedAt = (storage: Storage) => {
  try {
    return storage.getItem(LAST_UPDATE_CHECK_KEY);
  } catch {
    return null;
  }
};

const writeLastCheckedAt = (storage: Storage, value: string) => {
  try {
    storage.setItem(LAST_UPDATE_CHECK_KEY, value);
  } catch {
    // Update checks remain optional when local storage is unavailable.
  }
};

export function useUpdateController(client: UpdateClient, options: UpdateControllerOptions = {}) {
  const now = options.now ?? systemNow;
  const storage = options.storage ?? window.localStorage;
  const automaticDelayMs = options.automaticDelayMs ?? 15_000;
  const initialLastCheckedAt = useRef(readLastCheckedAt(storage));
  const [state, setState] = useState<UpdateState>({
    status: 'idle',
    currentVersion: null,
    lastCheckedAt: initialLastCheckedAt.current,
  });
  const mountedRef = useRef(true);
  const currentVersionRef = useRef<string | null>(null);
  const lastCheckedAtRef = useRef(initialLastCheckedAt.current);
  const descriptorRef = useRef<UpdateDescriptor | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    void client.getCurrentVersion().then((version) => {
      currentVersionRef.current = version;
      if (mountedRef.current) {
        setState((current) => current.status === 'idle'
          ? { ...current, currentVersion: version }
          : current);
      }
    }).catch(() => undefined);
  }, [client]);

  const checkNow = useCallback(() => {
    if (inFlightRef.current) return inFlightRef.current;

    const request = (async () => {
      if (mountedRef.current) {
        setState({
          status: 'checking',
          currentVersion: currentVersionRef.current,
          lastCheckedAt: lastCheckedAtRef.current,
        });
      }
      try {
        const currentVersionPromise = currentVersionRef.current
          ? Promise.resolve(currentVersionRef.current)
          : client.getCurrentVersion();
        const [currentVersion, descriptor] = await Promise.all([currentVersionPromise, client.check()]);
        currentVersionRef.current = currentVersion;
        const checkedAt = now().toISOString();
        lastCheckedAtRef.current = checkedAt;
        writeLastCheckedAt(storage, checkedAt);

        const priorDescriptor = descriptorRef.current;
        descriptorRef.current = descriptor;
        if (priorDescriptor && priorDescriptor !== descriptor) void priorDescriptor.close();

        if (!mountedRef.current) {
          if (descriptor) await descriptor.close();
          return;
        }
        setState(descriptor
          ? {
              status: 'available',
              currentVersion,
              nextVersion: descriptor.version,
              notes: descriptor.notes,
              lastCheckedAt: checkedAt,
            }
          : { status: 'current', currentVersion, lastCheckedAt: checkedAt });
      } catch {
        if (mountedRef.current) {
          setState({
            status: 'error',
            currentVersion: currentVersionRef.current,
            message: '暂时无法检查更新，请稍后重试。',
            lastCheckedAt: lastCheckedAtRef.current,
          });
        }
      } finally {
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = request;
    return request;
  }, [client, now, storage]);

  const install = useCallback(async () => {
    const descriptor = descriptorRef.current;
    const currentVersion = currentVersionRef.current;
    if (!descriptor || !currentVersion) return;
    setState({
      status: 'downloading',
      currentVersion,
      nextVersion: descriptor.version,
      progress: { downloaded: 0, total: null },
    });
    try {
      await descriptor.downloadAndInstall((progress) => {
        if (mountedRef.current) {
          setState({ status: 'downloading', currentVersion, nextVersion: descriptor.version, progress });
        }
      });
    } catch {
      if (mountedRef.current) {
        setState({
          status: 'error',
          currentVersion,
          message: '更新下载或安装失败，当前版本仍可继续使用。',
          lastCheckedAt: lastCheckedAtRef.current,
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!shouldRunAutomaticCheck(initialLastCheckedAt.current, now())) return undefined;
    const timer = window.setTimeout(() => void checkNow(), automaticDelayMs);
    return () => window.clearTimeout(timer);
  }, [automaticDelayMs, checkNow, now]);

  useEffect(() => () => {
    mountedRef.current = false;
    const descriptor = descriptorRef.current;
    descriptorRef.current = null;
    if (descriptor) void descriptor.close();
  }, []);

  return { state, checkNow, install };
}
