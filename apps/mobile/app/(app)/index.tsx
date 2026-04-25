import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Profile, SessionLog, StoredWorkoutPlan } from "@mai/shared";
import { getActiveSession, getRecentSessions } from "../../src/lib/sessions";
import { generatePlan, getCurrentPlan } from "../../src/lib/workouts";
import { useAuth } from "../../src/providers/AuthProvider";
import { colors } from "../../src/theme/colors";

export default function HomeScreen() {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();
  const [plan, setPlan] = useState<StoredWorkoutPlan | null>(null);
  const [activeSession, setActiveSession] = useState<SessionLog | null>(null);
  const [lastSession, setLastSession] = useState<SessionLog | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadPlan = useCallback(async () => {
    try {
      const [planRes, activeRes, recentRes] = await Promise.all([
        getCurrentPlan(),
        getActiveSession(),
        getRecentSessions(1),
      ]);
      setPlan(planRes.plan);
      setActiveSession("session" in activeRes && activeRes.session ? activeRes.session : null);
      setLastSession(recentRes.sessions[0] ?? null);
    } catch {
      setPlan(null);
      setActiveSession(null);
      setLastSession(null);
    } finally {
      setPlanLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setPlanLoading(true);
      void loadPlan();
    }, [loadPlan]),
  );

  const onGenerate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await generatePlan();
      setPlan(res.plan);
      router.push("/(app)/plan");
    } catch (err) {
      const message = err instanceof Error ? err.message : "could not generate";
      Alert.alert("Plan generation failed", message);
    } finally {
      setGenerating(false);
    }
  }, [generating, router]);

  if (!user) return null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Signed in as</Text>
        <Text style={styles.email}>{user.email}</Text>
        {user.name && <Text style={styles.name}>{user.name}</Text>}
      </View>

      {activeSession ? (
        <ResumeSessionCta
          session={activeSession}
          onPress={() =>
            router.push({
              pathname: "/(app)/session",
              params: { sessionId: activeSession.id },
            })
          }
        />
      ) : null}

      {!profile ? (
        <OnboardingCta onPress={() => router.push("/(app)/onboarding")} />
      ) : planLoading ? (
        <View style={styles.loaderCard}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : !plan ? (
        <GeneratePlanCta onPress={onGenerate} loading={generating} profile={profile} />
      ) : (
        <PlanPreview plan={plan} onPress={() => router.push("/(app)/plan")} />
      )}

      {!activeSession && lastSession ? (
        <LastSessionTile
          session={lastSession}
          onPress={() =>
            router.push({
              pathname: "/(app)/session",
              params: { sessionId: lastSession.id },
            })
          }
        />
      ) : null}

      {profile && <ProfileSummary profile={profile} />}

      <Pressable
        style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
        onPress={() => void signOut()}
      >
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

function LastSessionTile({
  session,
  onPress,
}: {
  session: SessionLog;
  onPress: () => void;
}) {
  const totalSets = session.exercises.reduce((acc, e) => acc + e.sets.length, 0);
  const volume = session.exercises.reduce(
    (acc, e) => acc + e.sets.reduce((a, s) => a + (s.weightKg ?? 0) * s.reps, 0),
    0,
  );
  const completedAt = session.completedAt ?? session.startedAt;
  const daysAgo = Math.max(0, Math.round((Date.now() - completedAt) / 86_400_000));
  const ago = daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo}d ago`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.lastCard, pressed && styles.lastCardPressed]}
    >
      <Text style={styles.lastEyebrow}>Last session · {ago}</Text>
      <Text style={styles.lastTitle}>{session.sessionTitle}</Text>
      <Text style={styles.lastMeta}>
        {totalSets} sets
        {volume > 0 ? ` · ${volume >= 1000 ? `${Math.round(volume / 100) / 10}k` : Math.round(volume)} kg×reps` : ""}
      </Text>
    </Pressable>
  );
}

function ResumeSessionCta({
  session,
  onPress,
}: {
  session: SessionLog;
  onPress: () => void;
}) {
  const logged = session.exercises.reduce((acc, e) => acc + e.sets.length, 0);
  const total = session.exercises.reduce((acc, e) => acc + e.plannedSets, 0);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.resumeCard, pressed && styles.resumeCardPressed]}
    >
      <Text style={styles.resumeEyebrow}>In progress</Text>
      <Text style={styles.resumeTitle}>{session.sessionTitle}</Text>
      <Text style={styles.resumeMeta}>
        {logged}/{total} sets logged · tap to resume
      </Text>
    </Pressable>
  );
}

function OnboardingCta({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.ctaCard}>
      <Text style={styles.ctaEyebrow}>Step 1 of 2</Text>
      <Text style={styles.ctaTitle}>Build your profile</Text>
      <Text style={styles.ctaBody}>
        A 3-minute conversation. No forms, no fluff. Tell me who I'm writing for and we get to
        work.
      </Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.ctaButton, pressed && styles.ctaButtonPressed]}
      >
        <Text style={styles.ctaButtonText}>Start discovery</Text>
      </Pressable>
    </View>
  );
}

function GeneratePlanCta({
  onPress,
  loading,
  profile,
}: {
  onPress: () => void;
  loading: boolean;
  profile: Profile;
}) {
  const goalLine =
    profile.primaryGoals && profile.primaryGoals.length > 0
      ? profile.primaryGoals.join(" · ")
      : "your goal";
  return (
    <View style={styles.ctaCard}>
      <Text style={styles.ctaEyebrow}>Step 2 of 2</Text>
      <Text style={styles.ctaTitle}>Get your plan</Text>
      <Text style={styles.ctaBody}>
        One week of sessions, built around {goalLine}. Regenerate whenever your week changes.
      </Text>
      <Pressable
        onPress={onPress}
        disabled={loading}
        style={({ pressed }) => [
          styles.ctaButton,
          pressed && styles.ctaButtonPressed,
          loading && styles.ctaButtonDisabled,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={styles.ctaButtonText}>Generate this week</Text>
        )}
      </Pressable>
    </View>
  );
}

function PlanPreview({ plan, onPress }: { plan: StoredWorkoutPlan; onPress: () => void }) {
  const sessionCount = plan.plan.weeklyTemplate.length;
  const totalMin = plan.plan.weeklyTemplate.reduce((acc, s) => acc + s.durationMinutes, 0);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.planCard, pressed && styles.planCardPressed]}
    >
      <Text style={styles.planEyebrow}>Active plan</Text>
      <Text style={styles.planTitle}>{plan.plan.name}</Text>
      <Text style={styles.planSummary}>{plan.plan.summary}</Text>
      <View style={styles.planMeta}>
        <Text style={styles.planMetaText}>
          {sessionCount} sessions · {totalMin} min · tap to open
        </Text>
      </View>
    </Pressable>
  );
}

function ProfileSummary({ profile }: { profile: Profile }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>Your profile</Text>
      {profile.primaryGoals && profile.primaryGoals.length > 0 && (
        <Row label="Goals" value={profile.primaryGoals.join(" · ")} />
      )}
      {profile.sessionsPerWeek !== undefined && profile.minutesPerSession !== undefined && (
        <Row
          label="Availability"
          value={`${profile.sessionsPerWeek}×/wk · ${profile.minutesPerSession} min`}
        />
      )}
      {profile.environment && <Row label="Environment" value={labelForEnv(profile.environment)} />}
      {profile.availableEquipment && profile.availableEquipment.length > 0 && (
        <Row label="Equipment" value={profile.availableEquipment.join(" · ")} />
      )}
      {profile.currentActivity && <Row label="Current activity" value={profile.currentActivity} />}
      {profile.healthNotes && <Row label="Health notes" value={profile.healthNotes} />}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function labelForEnv(env: NonNullable<Profile["environment"]>): string {
  switch (env) {
    case "home":
      return "Home";
    case "commercial_gym":
      return "Commercial gym";
    case "outdoor":
      return "Outdoor";
    case "hybrid":
      return "Hybrid";
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 14,
  },
  card: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eyebrow: {
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  email: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 8,
  },
  name: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  loaderCard: {
    backgroundColor: colors.surfaceElevated,
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  ctaCard: {
    backgroundColor: colors.surfaceElevated,
    padding: 22,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ctaEyebrow: {
    color: colors.accent,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "800",
  },
  ctaTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 6,
    letterSpacing: -0.3,
  },
  ctaBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  ctaButton: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 18,
  },
  ctaButtonPressed: {
    backgroundColor: colors.accentPressed,
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaButtonText: {
    color: colors.text,
    fontWeight: "800",
    letterSpacing: 0.4,
    fontSize: 15,
  },
  planCard: {
    backgroundColor: colors.surfaceElevated,
    padding: 22,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planCardPressed: {
    borderColor: colors.accent,
  },
  planEyebrow: {
    color: colors.success,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "800",
  },
  planTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 6,
    letterSpacing: -0.3,
  },
  planSummary: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
  planMeta: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  planMetaText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  summaryCard: {
    backgroundColor: colors.surface,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  rowLabel: {
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontWeight: "700",
    flex: 1,
  },
  rowValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    flex: 2,
    textAlign: "right",
  },
  signOut: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  signOutPressed: {
    backgroundColor: colors.surface,
  },
  signOutText: {
    color: colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  resumeCard: {
    backgroundColor: colors.accent,
    padding: 20,
    borderRadius: 16,
  },
  resumeCardPressed: {
    backgroundColor: colors.accentPressed,
  },
  resumeEyebrow: {
    color: colors.text,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "800",
    opacity: 0.8,
  },
  resumeTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 6,
    letterSpacing: -0.3,
  },
  resumeMeta: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 10,
    opacity: 0.85,
  },
  lastCard: {
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lastCardPressed: {
    borderColor: colors.accent,
  },
  lastEyebrow: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "800",
  },
  lastTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 4,
    letterSpacing: -0.2,
  },
  lastMeta: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
});
