import type { User } from "./types.js";

export interface AuthGoogleRequest {
  idToken: string;
}

export interface AuthGoogleResponse {
  token: string;
  user: User;
}

export interface MeResponse {
  user: User;
}

export interface ErrorResponse {
  error: string;
  message?: string;
}
