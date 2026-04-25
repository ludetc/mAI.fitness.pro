import type { Exercise, WorkoutSession } from "./workouts.js";

export interface SetLog {
  reps: number;
  weightKg?: number;
  rpe?: number;
}

export interface ExerciseLog {
  name: string;
  plannedSets: number;
  plannedReps: string;
  plannedRestSeconds: number;
  sets: SetLog[];
  skipped?: boolean;
  substitutedFor?: string;
  notes?: string;
  coachFeedback?: string;
}

export interface SessionLog {
  id: string;
  planId: string;
  sessionIndex: number;
  sessionTitle: string;
  startedAt: number;
  completedAt: number | null;
  exercises: ExerciseLog[];
  notes: string | null;
}

export interface StartSessionRequest {
  planId: string;
  sessionIndex: number;
}

export interface SessionEnvelope {
  session: SessionLog;
  plannedSession: WorkoutSession;
}

export type StartSessionResponse = SessionEnvelope;
export type GetSessionResponse = SessionEnvelope;
export type UpdateSessionResponse = SessionEnvelope;
export type CompleteSessionResponse = SessionEnvelope;

export interface UpdateSessionRequest {
  exercises: ExerciseLog[];
  notes?: string;
}

export type AdjustReason = "missing_equipment" | "crowded_gym" | "not_feeling_it" | "other";

export interface AdjustSessionRequest {
  exerciseIndex: number;
  reason: AdjustReason;
  details?: string;
}

export interface AdjustSessionResponse {
  suggestion: Exercise;
  rationale: string;
}

export interface RecentSessionsResponse {
  sessions: SessionLog[];
}
