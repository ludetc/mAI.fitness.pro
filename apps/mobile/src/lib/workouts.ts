import type { CurrentWorkoutResponse, GenerateWorkoutResponse } from "@mai/shared";
import { api } from "./api";

export function getCurrentPlan(): Promise<CurrentWorkoutResponse> {
  return api<CurrentWorkoutResponse>("/workouts/current");
}

export function generatePlan(): Promise<GenerateWorkoutResponse> {
  return api<GenerateWorkoutResponse>("/workouts/generate", { method: "POST" });
}
