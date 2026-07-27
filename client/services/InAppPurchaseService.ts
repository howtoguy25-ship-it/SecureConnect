import { Platform } from 'react-native';
import { apiRequest } from '@/lib/query-client';

const REMOVE_ADS_PRODUCT_ID = 'pryvo.removeads.2025';
const VIP_MONTHLY_PRODUCT_ID = 'pryvo.vip.monthly.2025';

let RNIap: any = null;

async function loadIAP() {
  if (Platform.OS === 'web') return null;
  try {
    RNIap = await import('react-native-iap');
    return RNIap;
  } catch (error) {
    console.log('[IAP] Could not load react-native-iap:', error);
    return null;
  }
}

class InAppPurchaseService {
  private initialized = false;
  private purchaseUpdateSubscription: any = null;
  private purchaseErrorSubscription: any = null;

  async initialize(): Promise<boolean> {
    if (this.initialized) return true;
    
    if (Platform.OS === 'web') {
      console.log('[IAP] Web platform - using Stripe instead');
      return false;
    }

    try {
      const iap = await loadIAP();
      if (!iap) return false;
      
      const result = await iap.initConnection();
      console.log('[IAP] Connection initialized:', result);
      this.initialized = true;
      return true;
    } catch (error) {
      console.log('[IAP] Native IAP not available (Expo Go or missing native module):', error);
      return false;
    }
  }

  async getProducts(): Promise<any[]> {
    if (!this.initialized) {
      const connected = await this.initialize();
      if (!connected) return [];
    }

    try {
      const iap = await loadIAP();
      if (!iap) return [];
      
      const products = await iap.getProducts({ skus: [REMOVE_ADS_PRODUCT_ID] });
      console.log('[IAP] Products:', products);
      return products;
    } catch (error) {
      console.error('[IAP] Failed to get products:', error);
      return [];
    }
  }

  // Returns the StoreKit-localized price string for the Remove Ads IAP
  // (e.g. "$29.99", "€27.99", "￥2,940"). Falls back to null when IAP
  // is unavailable (web, Expo Go, or product not yet loaded) — callers
  // should display a sensible default in that case.
  async getRemoveAdsLocalizedPrice(): Promise<string | null> {
    try {
      const products = await this.getProducts();
      const product = products.find((p: any) => p.productId === REMOVE_ADS_PRODUCT_ID);
      return product?.localizedPrice ?? product?.price ?? null;
    } catch (error) {
      console.log('[IAP] getRemoveAdsLocalizedPrice failed:', error);
      return null;
    }
  }

  // Returns the StoreKit-localized price string for the VIP Monthly
  // subscription. Same fallback semantics as getRemoveAdsLocalizedPrice.
  async getVipMonthlyLocalizedPrice(): Promise<string | null> {
    try {
      const subs = await this.getSubscriptions();
      const sub = subs.find((s: any) => s.productId === VIP_MONTHLY_PRODUCT_ID);
      return sub?.localizedPrice ?? sub?.price ?? null;
    } catch (error) {
      console.log('[IAP] getVipMonthlyLocalizedPrice failed:', error);
      return null;
    }
  }

  async purchaseRemoveAds(onSuccess: () => void, onError: (error: string) => void): Promise<void> {
    if (!this.initialized) {
      const connected = await this.initialize();
      if (!connected) {
        onError('In-App Purchases not available. Please try again later.');
        return;
      }
    }

    try {
      const iap = await loadIAP();
      if (!iap) {
        onError('In-App Purchases not available.');
        return;
      }

      this.purchaseUpdateSubscription = iap.purchaseUpdatedListener(async (purchase: any) => {
        console.log('[IAP] Purchase updated:', purchase);
        
        const receipt = purchase.transactionReceipt || purchase.purchaseToken;
        if (receipt) {
          try {
            await this.verifyPurchase(receipt);
            await iap.finishTransaction({ purchase, isConsumable: false });
            onSuccess();
          } catch (error) {
            console.error('[IAP] Verification failed:', error);
            onError('Purchase verification failed. Please contact support.');
          }
        }
      });

      this.purchaseErrorSubscription = iap.purchaseErrorListener((error: any) => {
        console.error('[IAP] Purchase error:', error);
        if (error.code !== 'E_USER_CANCELLED' && error.responseCode !== 1) {
          onError(error.message || 'Purchase failed. Please try again.');
        }
        this.cleanup();
      });

      if (Platform.OS === 'ios') {
        await iap.requestPurchase({ sku: REMOVE_ADS_PRODUCT_ID });
      } else {
        await iap.requestPurchase({ skus: [REMOVE_ADS_PRODUCT_ID] });
      }
    } catch (error: any) {
      console.error('[IAP] Request purchase error:', error);
      onError(error.message || 'Unable to start purchase. Please try again.');
      this.cleanup();
    }
  }

  async verifyPurchase(receipt: string, productId: string = REMOVE_ADS_PRODUCT_ID): Promise<void> {
    const response = await apiRequest('POST', '/api/iap/verify', {
      receipt,
      platform: Platform.OS,
      productId,
    });

    if (!response.ok) {
      throw new Error('Receipt verification failed');
    }
  }

  async purchaseVipMonthly(onSuccess: () => void, onError: (error: string) => void): Promise<void> {
    if (!this.initialized) {
      const connected = await this.initialize();
      if (!connected) {
        onError('In-App Purchases not available. Please try again later.');
        return;
      }
    }

    try {
      const iap = await loadIAP();
      if (!iap) {
        onError('In-App Purchases not available.');
        return;
      }

      this.purchaseUpdateSubscription = iap.purchaseUpdatedListener(async (purchase: any) => {
        console.log('[IAP] VIP Purchase updated:', purchase);

        const receipt = purchase.transactionReceipt || purchase.purchaseToken;
        if (receipt) {
          try {
            await this.verifyPurchase(receipt, VIP_MONTHLY_PRODUCT_ID);
            await iap.finishTransaction({ purchase, isConsumable: false });
            onSuccess();
          } catch (error) {
            console.error('[IAP] VIP Verification failed:', error);
            onError('Purchase verification failed. Please contact support.');
          }
        }
      });

      this.purchaseErrorSubscription = iap.purchaseErrorListener((error: any) => {
        console.error('[IAP] VIP Purchase error:', error);
        if (error.code !== 'E_USER_CANCELLED' && error.responseCode !== 1) {
          onError(error.message || 'Purchase failed. Please try again.');
        }
        this.cleanup();
      });

      const subscriptions = await iap.getSubscriptions({ skus: [VIP_MONTHLY_PRODUCT_ID] });
      console.log('[IAP] VIP Subscriptions:', subscriptions);

      if (Platform.OS === 'ios') {
        await iap.requestSubscription({ sku: VIP_MONTHLY_PRODUCT_ID });
      } else {
        await iap.requestSubscription({ skus: [VIP_MONTHLY_PRODUCT_ID] });
      }
    } catch (error: any) {
      console.error('[IAP] VIP Request purchase error:', error);
      onError(error.message || 'Unable to start purchase. Please try again.');
      this.cleanup();
    }
  }

  async getSubscriptions(): Promise<any[]> {
    if (!this.initialized) {
      const connected = await this.initialize();
      if (!connected) return [];
    }

    try {
      const iap = await loadIAP();
      if (!iap) return [];

      const subscriptions = await iap.getSubscriptions({ skus: [VIP_MONTHLY_PRODUCT_ID] });
      console.log('[IAP] Subscriptions:', subscriptions);
      return subscriptions;
    } catch (error) {
      console.error('[IAP] Failed to get subscriptions:', error);
      return [];
    }
  }

  async restorePurchases(onSuccess: () => void, onNoRestore: () => void): Promise<void> {
    if (!this.initialized) {
      const connected = await this.initialize();
      if (!connected) {
        onNoRestore();
        return;
      }
    }

    try {
      const iap = await loadIAP();
      if (!iap) {
        onNoRestore();
        return;
      }

      const purchases = await iap.getAvailablePurchases();
      console.log('[IAP] Available purchases:', purchases);

      let restored = false;

      const removeAdsPurchase = purchases.find(
        (p: any) => p.productId === REMOVE_ADS_PRODUCT_ID
      );
      if (removeAdsPurchase) {
        const receipt = removeAdsPurchase.transactionReceipt || removeAdsPurchase.purchaseToken;
        if (receipt) {
          await this.verifyPurchase(receipt, REMOVE_ADS_PRODUCT_ID);
          restored = true;
        }
      }

      const vipPurchase = purchases.find(
        (p: any) => p.productId === VIP_MONTHLY_PRODUCT_ID
      );
      if (vipPurchase) {
        const receipt = vipPurchase.transactionReceipt || vipPurchase.purchaseToken;
        if (receipt) {
          await this.verifyPurchase(receipt, VIP_MONTHLY_PRODUCT_ID);
          restored = true;
        }
      }

      if (restored) {
        onSuccess();
      } else {
        onNoRestore();
      }
    } catch (error) {
      console.error('[IAP] Restore purchases error:', error);
      onNoRestore();
    }
  }

  cleanup(): void {
    if (this.purchaseUpdateSubscription) {
      this.purchaseUpdateSubscription.remove();
      this.purchaseUpdateSubscription = null;
    }
    if (this.purchaseErrorSubscription) {
      this.purchaseErrorSubscription.remove();
      this.purchaseErrorSubscription = null;
    }
  }

  async endConnection(): Promise<void> {
    this.cleanup();
    if (this.initialized) {
      try {
        const iap = await loadIAP();
        if (iap) {
          await iap.endConnection();
        }
        this.initialized = false;
      } catch (error) {
        console.log('[IAP] End connection error:', error);
      }
    }
  }

  isAvailable(): boolean {
    return Platform.OS !== 'web';
  }
}

export const iapService = new InAppPurchaseService();
