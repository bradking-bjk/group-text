import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { BackHandler } from 'react-native';

/** A deliberately tiny stack navigator — enough for a handful of screens, no extra dependencies. */
export type Route =
  | { name: 'home'; tab?: 'groups' | 'inbox' | 'settings' }
  | { name: 'group'; groupId: number }
  | { name: 'editGroup'; groupId?: number }
  | { name: 'addMembers'; groupId: number }
  | { name: 'compose'; groupId: number }
  | { name: 'thread'; phone: string };

type Nav = {
  route: Route;
  push: (r: Route) => void;
  pop: () => void;
  replace: (r: Route) => void;
  reset: (r: Route) => void;
  version: number; // bumps on every navigation so screens can refresh data on focus
};

const NavContext = createContext<Nav | null>(null);

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<Route[]>([{ name: 'home', tab: 'groups' }]);
  const [version, setVersion] = useState(0);

  const push = useCallback((r: Route) => {
    setStack((s) => [...s, r]);
    setVersion((v) => v + 1);
  }, []);
  const pop = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    setVersion((v) => v + 1);
  }, []);
  const replace = useCallback((r: Route) => {
    setStack((s) => [...s.slice(0, -1), r]);
    setVersion((v) => v + 1);
  }, []);
  const reset = useCallback((r: Route) => {
    setStack([r]);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, pop]);

  const value = useMemo(
    () => ({ route: stack[stack.length - 1], push, pop, replace, reset, version }),
    [stack, push, pop, replace, reset, version],
  );
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): Nav {
  const n = useContext(NavContext);
  if (!n) throw new Error('useNav outside NavProvider');
  return n;
}
