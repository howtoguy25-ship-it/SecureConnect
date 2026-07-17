import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '@/navigation/types';

// Lets the assistant (mounted alongside the navigator, not inside a screen) drive
// navigation without needing the `navigation` prop -- the officially documented pattern
// for navigating from outside a screen component.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigateTo<RouteName extends keyof RootStackParamList>(
  ...args: RootStackParamList[RouteName] extends undefined
    ? [screen: RouteName]
    : [screen: RouteName, params: RootStackParamList[RouteName]]
): void {
  if (!navigationRef.isReady()) return;
  const [screen, params] = args as [RouteName, RootStackParamList[RouteName]];
  navigationRef.navigate(screen as any, params as any);
}

export function currentScreenName(): string {
  return navigationRef.isReady() ? (navigationRef.getCurrentRoute()?.name ?? 'Projects') : 'Projects';
}
