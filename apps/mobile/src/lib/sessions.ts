import type {
  AdjustSessionRequest,
  AdjustSessionResponse,
  CompleteSessionResponse,
  GetSessionResponse,
  RecentSessionsResponse,
  SessionEnvelope,
  StartSessionRequest,
  StartSessionResponse,
  UpdateSessionRequest,
  UpdateSessionResponse,
} from "@mai/shared";
import { api } from "./api";

export function startSession(
  body: StartSessionRequest,
): Promise<StartSessionResponse> {
  return api<StartSessionResponse>("/sessions/start", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getSession(id: string): Promise<GetSessionResponse> {
  return api<GetSessionResponse>(`/sessions/${encodeURIComponent(id)}`);
}

export function getActiveSession(): Promise<
  SessionEnvelope | { session: null }
> {
  return api<SessionEnvelope | { session: null }>("/sessions/active");
}

export function updateSession(
  id: string,
  body: UpdateSessionRequest,
): Promise<UpdateSessionResponse> {
  return api<UpdateSessionResponse>(`/sessions/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function completeSession(id: string): Promise<CompleteSessionResponse> {
  return api<CompleteSessionResponse>(
    `/sessions/${encodeURIComponent(id)}/complete`,
    { method: "POST" },
  );
}

export function adjustSession(
  id: string,
  body: AdjustSessionRequest,
): Promise<AdjustSessionResponse> {
  return api<AdjustSessionResponse>(
    `/sessions/${encodeURIComponent(id)}/adjust`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export function getRecentSessions(limit = 5): Promise<RecentSessionsResponse> {
  return api<RecentSessionsResponse>(`/sessions/recent?limit=${limit}`);
}
