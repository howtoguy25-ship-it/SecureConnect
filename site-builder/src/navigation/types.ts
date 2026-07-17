import { PageType } from '@/types';
import { BuildComplexity } from '@/data/pricing';

export type RootStackParamList = {
  Projects: undefined;
  NewProject: undefined;
  BuildMethod: { pageType: PageType };
  ThemeGallery: { pageType: PageType };
  AIPrompt: { pageType: PageType; initialPrompt?: string };
  AIBuildProgress: { sessionId: string; pageType: PageType; prompt: string; complexity: BuildComplexity };
  Subscription: undefined;
  Editor: { projectId: string };
  Publish: { projectId: string };
  Account: undefined;
};
