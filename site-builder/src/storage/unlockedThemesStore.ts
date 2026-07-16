import AsyncStorage from '@react-native-async-storage/async-storage';

const UNLOCKED_KEY = 'siteforge:unlockedThemes';

export const unlockedThemesStore = {
  async list(): Promise<string[]> {
    const raw = await AsyncStorage.getItem(UNLOCKED_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  },

  async unlock(themeId: string): Promise<void> {
    const current = await this.list();
    if (!current.includes(themeId)) {
      await AsyncStorage.setItem(UNLOCKED_KEY, JSON.stringify([...current, themeId]));
    }
  },

  async isUnlocked(themeId: string): Promise<boolean> {
    const current = await this.list();
    return current.includes(themeId);
  },
};
