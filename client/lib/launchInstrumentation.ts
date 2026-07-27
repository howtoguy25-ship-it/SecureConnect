import { Platform } from 'react-native';

const launchStart = Date.now();
const checkpoints: { name: string; time: number; thread: string }[] = [];

export function logCheckpoint(name: string) {
  const elapsed = Date.now() - launchStart;
  const thread = Platform.OS === 'web' ? 'main' : 'js';
  checkpoints.push({ name, time: elapsed, thread });
  console.log(`[LAUNCH] ${elapsed}ms - ${name} (${thread} thread)`);
}

export function logMemory() {
  if (Platform.OS === 'web') return;
  
  try {
    const used = (performance as any).memory?.usedJSHeapSize;
    const total = (performance as any).memory?.totalJSHeapSize;
    if (used && total) {
      console.log(`[LAUNCH] Memory: ${Math.round(used / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`);
    }
  } catch {
    // Memory API not available
  }
}

export function getLaunchReport(): string {
  return checkpoints
    .map(c => `${c.time}ms: ${c.name}`)
    .join('\n');
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
  operationName: string
): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[LAUNCH] TIMEOUT: ${operationName} exceeded ${ms}ms - using fallback`);
      resolve(fallback);
    }, ms);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        console.warn(`[LAUNCH] ERROR in ${operationName}:`, error);
        resolve(fallback);
      });
  });
}

export function deferToNextFrame(fn: () => void) {
  if (Platform.OS === 'web') {
    requestAnimationFrame(() => setTimeout(fn, 0));
  } else {
    setImmediate(fn);
  }
}

logCheckpoint('instrumentation_loaded');
