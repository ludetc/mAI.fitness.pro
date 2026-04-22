export interface Exercise {
  name: string;
  sets: number;
  reps: string;
  restSeconds: number;
  notes?: string;
}

export interface WorkoutSession {
  title: string;
  focus: string;
  durationMinutes: number;
  exercises: Exercise[];
}

export interface WorkoutPlan {
  name: string;
  summary: string;
  sessionsPerWeek: number;
  durationWeeks: number;
  weeklyTemplate: WorkoutSession[];
}

export interface StoredWorkoutPlan {
  id: string;
  status: "active" | "archived";
  goal: string | null;
  plan: WorkoutPlan;
  createdAt: number;
}

export interface GenerateWorkoutResponse {
  plan: StoredWorkoutPlan;
}

export interface CurrentWorkoutResponse {
  plan: StoredWorkoutPlan | null;
}
