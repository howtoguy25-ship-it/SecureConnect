// Mock data for Apple App Store review testing
// This data is ONLY served to Apple reviewer test accounts (phone ending with 5551234567)
// and ONLY in development/Expo Go testing - NOT in production App Store builds

export interface MockUser {
  id: string;
  phoneNumber: string;
  displayName: string;
  avatarIndex: number;
  isVip: boolean;
}

// Shape matches DatabaseStorage.getConversations()'s return value exactly
// (see server/storage.ts) — the client's ChatsScreen renders both through
// the same ConversationItem component and requires the nested `otherUser`
// object; a mismatched flat shape here means every mock row silently
// renders as nothing (ConversationItem returns null when otherUser is
// missing), so Apple's reviewer test account would see an empty chat list.
export interface MockConversation {
  id: string;
  numberType: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  createdAt: string;
  otherUser: {
    id: string;
    phoneNumber: string;
    displayName: string;
    avatarIndex: number;
    avatarUrl: string | null;
    isVip: boolean;
    lastSeen: string;
  };
  unreadCount: number;
}

export interface MockMessage {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  createdAt: string;
  isEncrypted: boolean;
  status: string;
}

// Mock users that Apple reviewers will see in their chats
export const MOCK_USERS: MockUser[] = [
  {
    id: 'mock-user-alice',
    phoneNumber: '+1234567001',
    displayName: 'Alice',
    avatarIndex: 0,
    isVip: false,
  },
  {
    id: 'mock-user-bob',
    phoneNumber: '+1234567002',
    displayName: 'Bob',
    avatarIndex: 1,
    isVip: true,
  },
  {
    id: 'mock-user-charlie',
    phoneNumber: '+1234567003',
    displayName: 'Charlie',
    avatarIndex: 2,
    isVip: false,
  },
];

// Generate mock conversations for a reviewer
export function getMockConversations(reviewerUserId: string): MockConversation[] {
  const now = new Date();
  return MOCK_USERS.map((user, index) => {
    const lastMessageAt = new Date(now.getTime() - (index + 1) * 3600000).toISOString();
    return {
      id: `mock-conv-${user.id}`,
      numberType: 'personal',
      lastMessageAt,
      lastMessagePreview: getInitialMessage(user.displayName),
      createdAt: lastMessageAt,
      otherUser: {
        id: user.id,
        phoneNumber: user.phoneNumber,
        displayName: user.displayName,
        avatarIndex: user.avatarIndex,
        avatarUrl: null,
        isVip: user.isVip,
        lastSeen: now.toISOString(),
      },
      unreadCount: index === 0 ? 1 : 0,
    };
  });
}

function getInitialMessage(name: string): string {
  const messages: Record<string, string> = {
    'Alice': 'Hey! Welcome to Pryvo. Feel free to message me!',
    'Bob': 'Hi there! I love the encryption features here.',
    'Charlie': 'Nice to meet you! This app is great for privacy.',
  };
  return messages[name] || 'Hello!';
}

// Generate initial mock messages for a conversation
export function getMockMessages(conversationId: string, reviewerUserId: string): MockMessage[] {
  const mockUser = MOCK_USERS.find(u => conversationId === `mock-conv-${u.id}`);
  if (!mockUser) return [];

  const now = new Date();
  const baseTime = now.getTime() - 3600000;

  const messageTemplates: Record<string, string[]> = {
    'Alice': [
      'Hey! Welcome to Pryvo!',
      'All our messages are end-to-end encrypted.',
      'Feel free to send me a message to test the chat!',
    ],
    'Bob': [
      'Hi! Great to see you on Pryvo.',
      'I really like the VIP features, especially the virtual phone number!',
      'Have you tried making a call yet?',
    ],
    'Charlie': [
      'Hello! Nice to meet you.',
      'This app keeps all our conversations private.',
      'Let me know if you have any questions!',
    ],
  };

  const templates = messageTemplates[mockUser.displayName] || ['Hello!'];
  
  return templates.map((content, index) => ({
    id: `mock-msg-${conversationId}-${index}`,
    conversationId,
    senderId: mockUser.id,
    receiverId: reviewerUserId,
    content,
    mediaUrl: null,
    mediaType: null,
    createdAt: new Date(baseTime + index * 60000).toISOString(),
    isEncrypted: true,
    status: 'read',
  }));
}

// Bot auto-reply messages based on user input
const AUTO_REPLIES: string[] = [
  "That's great to hear! Pryvo keeps all our messages private.",
  "I love how easy it is to use this app!",
  "The encryption here is top-notch. Very secure!",
  "Have you tried the voice call feature? It works really well!",
  "Thanks for your message! I appreciate the quick response.",
  "This is such a convenient way to stay in touch securely.",
  "I feel much safer knowing our chats are encrypted.",
  "The app design is really clean and modern!",
];

let replyIndex = 0;

export function getAutoReply(): string {
  const reply = AUTO_REPLIES[replyIndex % AUTO_REPLIES.length];
  replyIndex++;
  return reply;
}

// Check if a user ID is a mock user (bot)
export function isMockUser(userId: string): boolean {
  return userId.startsWith('mock-user-');
}

// Check if a conversation is a mock conversation
export function isMockConversation(conversationId: string): boolean {
  return conversationId.startsWith('mock-conv-');
}

// Get mock user by ID
export function getMockUser(userId: string): MockUser | undefined {
  return MOCK_USERS.find(u => u.id === userId);
}

// Generate a mock message from a bot
export function createMockBotReply(
  conversationId: string,
  botUserId: string,
  reviewerUserId: string
): MockMessage {
  return {
    id: `mock-msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    conversationId,
    senderId: botUserId,
    receiverId: reviewerUserId,
    content: getAutoReply(),
    mediaUrl: null,
    mediaType: null,
    createdAt: new Date().toISOString(),
    isEncrypted: true,
    status: 'sent',
  };
}
