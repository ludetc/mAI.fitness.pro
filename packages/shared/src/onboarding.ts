export type Sex = "male" | "female" | "other" | "prefer_not_to_say";

export interface Profile {
  age?: number;
  sex?: Sex;
  heightCm?: number;
  weightKg?: number;
  primaryGoals?: string[];
  sessionsPerWeek?: number;
  minutesPerSession?: number;
  environment?: "home" | "commercial_gym" | "outdoor" | "hybrid";
  availableEquipment?: string[];
  currentActivity?: string;
  healthNotes?: string;
  occupation?: string;
  hobbies?: string[];
  personalityNotes?: string;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  kind: "onboarding";
  createdAt: number;
  completedAt: number | null;
}

export interface OnboardingStartResponse {
  conversation: Conversation;
  messages: ChatMessage[];
}

export interface OnboardingSendRequest {
  message: string;
}

export interface OnboardingSendResponse {
  messages: ChatMessage[];
  completed: boolean;
  profile: Profile | null;
}

export interface OnboardingHistoryResponse {
  conversation: Conversation;
  messages: ChatMessage[];
  profile: Profile | null;
}

export interface ProfileStatusResponse {
  profile: Profile | null;
  onboardingConversationId: string | null;
}
