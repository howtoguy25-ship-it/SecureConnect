import { PageType } from '@/types';

export type RootStackParamList = {
  Projects: undefined;
  NewProject: undefined;
  ThemeGallery: { pageType: PageType };
  Editor: { projectId: string };
  Account: undefined;
};
