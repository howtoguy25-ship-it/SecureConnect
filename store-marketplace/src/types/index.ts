/**
 * Core domain types shared across the app and (by copy) the Cloud Functions in functions/src.
 * Firestore documents are untyped at rest; these types describe the shape we read/write.
 */

export type Timestamp = number; // epoch millis, converted from Firestore Timestamp at the service layer

export type MembershipRole = "owner" | "manager" | "staff";

export interface MembershipPermissions {
  canEditStock: boolean;
  canPostAnnouncements: boolean;
  canSendNotifications: boolean;
  canManageTeam: boolean;
}

export const ROLE_DEFAULT_PERMISSIONS: Record<MembershipRole, MembershipPermissions> = {
  owner: {
    canEditStock: true,
    canPostAnnouncements: true,
    canSendNotifications: true,
    canManageTeam: true,
  },
  manager: {
    canEditStock: true,
    canPostAnnouncements: true,
    canSendNotifications: true,
    canManageTeam: false,
  },
  staff: {
    canEditStock: true,
    canPostAnnouncements: false,
    canSendNotifications: false,
    canManageTeam: false,
  },
};

export type MembershipStatus = "active" | "muted" | "blocked" | "kicked";

/** businesses/{businessId}/team/{uid} */
export interface Membership {
  uid: string;
  businessId: string;
  role: MembershipRole;
  permissions: MembershipPermissions;
  status: MembershipStatus;
  displayName: string;
  invitedBy?: string;
  joinedAt: Timestamp;
}

export type BusinessVisibility = "public" | "private" | "team";

export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";

export interface GeoPoint {
  lat: number;
  lng: number;
}

/** businesses/{businessId} */
export interface Business {
  id: string;
  ownerId: string;
  name: string;
  categoryId: string;
  description: string;
  abn?: string;
  acn?: string;
  legalBusinessName?: string;
  openedDate?: string; // ISO date, user-entered
  address: string;
  location: GeoPoint;
  geohash: string;
  logoUrl?: string;
  coverImageUrl?: string;
  visibility: BusinessVisibility;
  isPublished: boolean;
  publishedAt?: Timestamp;
  verificationStatus: VerificationStatus;
  followerCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock" | "coming_soon";

/** businesses/{businessId}/stockItems/{itemId} */
export interface StockItem {
  id: string;
  businessId: string;
  categoryId: string;
  name: string;
  price: number | null;
  currency: string;
  stockStatus: StockStatus;
  imageUrl?: string;
  /** Free-form answers keyed by CategoryFieldSpec.key (flavor, ingredients, allergens, size, ABV, etc). */
  fields: Record<string, string>;
  featuredUntil?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  updatedBy: string;
}

export type AnnouncementType = "general" | "new_item" | "promotion" | "stock_update";

/** businesses/{businessId}/announcements/{announcementId} */
export interface Announcement {
  id: string;
  businessId: string;
  authorId: string;
  authorName: string;
  type: AnnouncementType;
  title: string;
  body: string;
  imageUrl?: string;
  pinned: boolean;
  createdAt: Timestamp;
  expiresAt?: Timestamp;
}

export interface FollowNotifyPrefs {
  announcements: boolean;
  stockChanges: boolean;
  promotions: boolean;
}

/** users/{uid}/follows/{businessId} */
export interface Follow {
  businessId: string;
  uid: string;
  notify: FollowNotifyPrefs;
  muted: boolean;
  followedAt: Timestamp;
}

/** users/{uid}/devices/{token} */
export interface DeviceToken {
  token: string;
  platform: "ios" | "android" | "web";
  updatedAt: Timestamp;
}

/** businesses/{businessId}/verificationRequests/{requestId} */
export interface VerificationRequest {
  id: string;
  businessId: string;
  submittedBy: string;
  abn?: string;
  acn?: string;
  legalBusinessName: string;
  status: VerificationStatus;
  abrEntityName?: string;
  abrEntityStatus?: string;
  rejectionReason?: string;
  submittedAt: Timestamp;
  reviewedAt?: Timestamp;
}

/** businesses/{businessId}/blockedUsers/{uid} */
export interface BlockedUser {
  uid: string;
  blockedBy: string;
  reason?: string;
  blockedAt: Timestamp;
}

/** users/{uid}/notifications/{id} -- in-app history mirror of what was pushed via FCM,
 * so the Notifications tab shows something even for messages missed while offline. */
export interface AppNotification {
  id: string;
  businessId: string;
  businessName: string;
  title: string;
  body: string;
  channel: "announcements" | "stockChanges" | "promotions";
  read: boolean;
  createdAt: Timestamp;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email?: string;
  photoURL?: string;
  createdAt: Timestamp;
}

/** Result of the AI-assisted onboarding draft -- always owner-reviewed before publish. */
export interface AiStoreDraft {
  suggestedDescription: string;
  suggestedCategoryId: string;
  suggestedItems: Array<{
    name: string;
    price: number | null;
    fields: Record<string, string>;
  }>;
  sourceNotes: string;
  generatedAt: Timestamp;
}
