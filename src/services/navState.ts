// Tiny module-level flag, set by MapScreen whenever turn-by-turn navigation is active and
// cleared when it ends. Exists so components mounted above/outside MapScreen (currently just
// AppOpenAdManager) can cheaply check "is the user actively driving right now" without needing
// React context wiring or a re-render -- a full-screen ad popping up over an active route is a
// real safety problem, not just an annoyance, so every ad show path must gate on this.
let navigationActive = false;

export function setNavigationActive(active: boolean): void {
  navigationActive = active;
}

export function isNavigationActive(): boolean {
  return navigationActive;
}
