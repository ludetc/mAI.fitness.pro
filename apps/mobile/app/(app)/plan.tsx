import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Exercise, StoredWorkoutPlan, WorkoutSession } from "@mai/shared";
import { generatePlan, getCurrentPlan } from "../../src/lib/workouts";
import { colors } from "../../src/theme/colors";

export default function PlanScreen() {
  const router = useRouter();
  const [plan, setPlan] = useState<StoredWorkoutPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getCurrentPlan();
      setPlan(res.plan);
    } catch (err) {
      const message = err instanceof Error ? err.message : "could not load plan";
      Alert.alert("Plan failed to load", message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRegenerate = useCallback(async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const res = await generatePlan();
      setPlan(res.plan);
    } catch (err) {
      const message = err instanceof Error ? err.message : "could not regenerate";
      Alert.alert("Regeneration failed", message);
    } finally {
      setRegenerating(false);
    }
  }, [regenerating]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!plan) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>No active plan.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Week 1 · {plan.plan.durationWeeks} week plan</Text>
        <Text style={styles.title}>{plan.plan.name}</Text>
        <Text style={styles.summary}>{plan.plan.summary}</Text>
        <View style={styles.meta}>
          <Text style={styles.metaText}>
            {plan.plan.sessionsPerWeek} sessions · {totalMinutes(plan.plan.weeklyTemplate)} min
            total
          </Text>
        </View>
      </View>

      {plan.plan.weeklyTemplate.map((session, i) => (
        <SessionCard
          key={`${i}-${session.title}`}
          session={session}
          index={i}
          onStart={() =>
            router.push({
              pathname: "/(app)/session",
              params: { planId: plan.id, index: String(i) },
            })
          }
        />
      ))}

      <Pressable
        onPress={onRegenerate}
        disabled={regenerating}
        style={({ pressed }) => [
          styles.regen,
          pressed && styles.regenPressed,
          regenerating && styles.regenDisabled,
        ]}
      >
        {regenerating ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.regenText}>Regenerate plan</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function SessionCard({
  session,
  index,
  onStart,
}: {
  session: WorkoutSession;
  index: number;
  onStart: () => void;
}) {
  return (
    <View style={styles.sessionCard}>
      <View style={styles.sessionHeader}>
        <Text style={styles.sessionNumber}>Day {index + 1}</Text>
        <Text style={styles.sessionDuration}>{session.durationMinutes} min</Text>
      </View>
      <Text style={styles.sessionTitle}>{session.title}</Text>
      <Text style={styles.sessionFocus}>{session.focus}</Text>
      <View style={styles.exerciseList}>
        {session.exercises.map((ex, i) => (
          <ExerciseRow key={`${i}-${ex.name}`} exercise={ex} />
        ))}
      </View>
      <Pressable
        onPress={onStart}
        style={({ pressed }) => [styles.startButton, pressed && styles.startButtonPressed]}
      >
        <Text style={styles.startButtonText}>Start this session</Text>
      </Pressable>
    </View>
  );
}

function ExerciseRow({ exercise }: { exercise: Exercise }) {
  return (
    <View style={styles.exerciseRow}>
      <Text style={styles.exerciseName}>{exercise.name}</Text>
      <Text style={styles.exerciseSpec}>
        {exercise.sets} × {exercise.reps} · {exercise.restSeconds}s rest
      </Text>
      {exercise.notes ? <Text style={styles.exerciseNotes}>{exercise.notes}</Text> : null}
    </View>
  );
}

function totalMinutes(sessions: WorkoutSession[]): number {
  return sessions.reduce((acc, s) => acc + s.durationMinutes, 0);
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 14,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 15,
  },
  header: {
    backgroundColor: colors.surfaceElevated,
    padding: 22,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "800",
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  summary: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2,
  },
  meta: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
    paddingTop: 12,
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  sessionCard: {
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  sessionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sessionNumber: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  sessionDuration: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  sessionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
    letterSpacing: -0.2,
  },
  sessionFocus: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 8,
  },
  exerciseList: {
    marginTop: 6,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
  },
  exerciseRow: {
    gap: 2,
  },
  exerciseName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  exerciseSpec: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
  },
  exerciseNotes: {
    color: colors.textMuted,
    fontSize: 12,
    fontStyle: "italic",
    marginTop: 2,
  },
  regen: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  regenPressed: {
    backgroundColor: colors.surface,
  },
  regenDisabled: {
    opacity: 0.5,
  },
  regenText: {
    color: colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  startButton: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 12,
  },
  startButtonPressed: {
    backgroundColor: colors.accentPressed,
  },
  startButtonText: {
    color: colors.text,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
