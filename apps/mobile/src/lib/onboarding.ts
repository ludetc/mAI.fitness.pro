import type {
  OnboardingHistoryResponse,
  OnboardingSendRequest,
  OnboardingSendResponse,
  OnboardingStartResponse,
  ProfileStatusResponse,
} from "@mai/shared";
import { api } from "./api";

export function startOnboarding(): Promise<OnboardingStartResponse> {
  return api<OnboardingStartResponse>("/chat/onboarding/start", { method: "POST" });
}

export function sendOnboardingMessage(
  conversationId: string,
  message: string,
): Promise<OnboardingSendResponse> {
  const body: OnboardingSendRequest = { message };
  return api<OnboardingSendResponse>(
    `/chat/onboarding/${encodeURIComponent(conversationId)}/send`,
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

export function getOnboardingHistory(
  conversationId: string,
): Promise<OnboardingHistoryResponse> {
  return api<OnboardingHistoryResponse>(
    `/chat/onboarding/${encodeURIComponent(conversationId)}`,
  );
}

export function getProfileStatus(): Promise<ProfileStatusResponse> {
  return api<ProfileStatusResponse>("/me/profile");
}
