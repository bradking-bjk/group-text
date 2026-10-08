import { useCallback, useEffect, useState } from 'react';
import { useNav } from '../nav';

const listeners = new Set<() => void>();

/** Tell every screen that data changed (e.g. new texts were imported). */
export function notifyDataChanged() {
  listeners.forEach((l) => l());
}

/** Loads data on mount, on every navigation, and whenever notifyDataChanged() fires. */
export function useData<T>(load: () => Promise<T>, deps: unknown[] = []): { data: T | null; reload: () => void } {
  const { version } = useNav();
  const [data, setData] = useState<T | null>(null);
  const [tick, setTick] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableLoad = useCallback(load, deps);

  useEffect(() => {
    let alive = true;
    stableLoad()
      .then((d) => alive && setData(d))
      .catch((e) => console.warn(e));
    return () => {
      alive = false;
    };
  }, [stableLoad, version, tick]);

  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  return { data, reload: () => setTick((t) => t + 1) };
}
