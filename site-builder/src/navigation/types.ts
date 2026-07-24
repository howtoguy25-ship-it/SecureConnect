import { PageType, CanvasSize } from '@/types';
import { BuildComplexity } from '@/data/pricing';

export type RootStackParamList = {
  Projects: undefined;
  NewProject: undefined;
  BuildMethod: { pageType: PageType; customSize?: CanvasSize };
  ThemeGallery: { pageType: PageType; customSize?: CanvasSize };
  AIPrompt: { pageType: PageType; initialPrompt?: string };
  AIClarify: { pageType: PageType; prompt: string; complexity: BuildComplexity; referenceImages?: string[] };
  AIBuildProgress: { sessionId: string; pageType: PageType; prompt: string; complexity: BuildComplexity };
  Subscription: undefined;
  Editor: { projectId: string };
  Publish: { projectId: string };
  BuyDomain: { projectId: string };
  TransferDomain: undefined;
  Policy: { policyType: 'privacy' | 'returns' };
  Support: undefined;
  Account: undefined;
  SellerAccount: undefined;
  Orders: undefined;
  DiscountCodes: undefined;
  Domains: undefined;
};
