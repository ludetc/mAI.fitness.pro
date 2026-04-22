import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type {
  AdjustReason,
  AdjustSessionResponse,
  Exercise,
  ExerciseLog,
  SessionLog,
  SetLog,
  WorkoutSession,
} from "@mai/shared";
import {
  adjustSession,
  completeSession,
  getSession,
  startSession,
  updateSession,
} from "../../src/lib/sessions";
import { colors } from "../../src/theme/colors";

type SessionParams = {
  sessionId?: string;
  planId?: string;
  index?: string;
};

export default function SessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<SessionParams>();

  const [session, setSession] = useState<SessionLog | null>(null);
  const [plannedSession, setPlannedSession] = useState<WorkoutSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [restSecondsLeft, setRestSecondsLeft] = useState(0);

  const persistedExercisesRef = useRef<ExerciseLog[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let envelope;
        if (params.sessionId) {
          envelope = await getSession(params.sessionId);
        } else if (params.planId && params.index !== undefined) {
          envelope = await startSession({
            planId: params.planId,
            sessionIndex: Number(params.index),
          });
        } else {
          Alert.alert("Session", "No session provided.");
          router.back();
          return;
        }
        if (cancelled) return;
        setSession(envelope.session);
        setPlannedSession(envelope.plannedSession);
        persistedExercisesRef.current = envelope.session.exercises;
        setCurrentIndex(firstIncompleteIndex(envelope.session.exercises));
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "could not load session";
        Alert.alert("Session", message, [{ text: "OK", onPress: () => router.back() }]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.sessionId, params.planId, params.index, router]);

  useEffect(() => {
    if (restSecondsLeft <= 0) return;
    const t = setInterval(() => {
      setRestSecondsLeft((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [restSecondsLeft]);

  const exercises = session?.exercises ?? [];
  const current = exercises[currentIndex];

  const persistIfChanged = useCallback(
    async (next: ExerciseLog[]) => {
      if (!session) return;
      const prev = persistedExercisesRef.current;
      if (prev && JSON.stringify(prev) === JSON.stringify(next)) return;
      try {
        const res = await updateSession(session.id, { exercises: next });
        persistedExercisesRef.current = res.session.exercises;
      } catch {
        // Best-effort. Session is still playable from local state.
      }
    },
    [session],
  );

  const logSet = useCallback(
    (set: SetLog) => {
      if (!session) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const next = exercises.map((e, i) =>
        i === currentIndex ? { ...e, sets: [...e.sets, set] } : e,
      );
      setSession({ ...session, exercises: next });
      void persistIfChanged(next);
      const currentEx = next[currentIndex];
      if (currentEx) setRestSecondsLeft(currentEx.plannedRestSeconds);
    },
    [session, exercises, currentIndex, persistIfChanged],
  );

  const removeLastSet = useCallback(() => {
    if (!session) return;
    const ex = exercises[currentIndex];
    if (!ex || ex.sets.length === 0) return;
    const next = exercises.map((e, i) =>
      i === currentIndex ? { ...e, sets: e.sets.slice(0, -1) } : e,
    );
    setSession({ ...session, exercises: next });
    void persistIfChanged(next);
  }, [session, exercises, currentIndex, persistIfChanged]);

  const skipExercise = useCallback(() => {
    if (!session) return;
    const next = exercises.map((e, i) =>
      i === currentIndex ? { ...e, skipped: true } : e,
    );
    setSession({ ...session, exercises: next });
    void persistIfChanged(next);
    setRestSecondsLeft(0);
    if (currentIndex < exercises.length - 1) setCurrentIndex(currentIndex + 1);
  }, [session, exercises, currentIndex, persistIfChanged]);

  const applyAdjust = useCallback(
    (suggestion: Exercise, originalName: string) => {
      if (!session) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const next = exercises.map((e, i) =>
        i === currentIndex
          ? {
              ...e,
              name: suggestion.name,
              plannedSets: suggestion.sets,
              plannedReps: suggestion.reps,
              plannedRestSeconds: suggestion.restSeconds,
              substitutedFor: originalName,
              ...(suggestion.notes ? { notes: suggestion.notes } : {}),
              sets: [],
            }
          : e,
      );
      setSession({ ...session, exercises: next });
      void persistIfChanged(next);
    },
    [session, exercises, currentIndex, persistIfChanged],
  );

  const onFinish = useCallback(async () => {
    if (!session) return;
    setFinishing(true);
    try {
      const res = await completeSession(session.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSession(res.session);
      setRestSecondsLeft(0);
    } catch (err) {
      const message = err instanceof Error ? err.message : "could not finish";
      Alert.alert("Could not finish", message);
    } finally {
      setFinishing(false);
    }
  }, [session]);

  if (loading || !session || !plannedSession || !current) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (session.completedAt) {
    return <SessionSummary session={session} onDone={() => router.replace("/(app)")} />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>{session.sessionTitle}</Text>
        <Text style={styles.progress}>
          Exercise {currentIndex + 1} of {exercises.length}
        </Text>

        {restSecondsLeft > 0 ? (
          <RestTimerBanner
            secondsLeft={restSecondsLeft}
            onSkip={() => setRestSecondsLeft(0)}
          />
        ) : null}

        <ExerciseFocus
          exercise={current}
          onSwap={() => setAdjustOpen(true)}
          onSkip={skipExercise}
        />

        <SetLogger current={current} onLogSet={logSet} onRemoveLast={removeLastSet} />

        <ExerciseList
          exercises={exercises}
          currentIndex={currentIndex}
          onTap={(i) => {
            setCurrentIndex(i);
            setRestSecondsLeft(0);
          }}
        />

        <View style={styles.footer}>
          {currentIndex < exercises.length - 1 ? (
            <Pressable
              onPress={() => {
                setCurrentIndex(currentIndex + 1);
                setRestSecondsLeft(0);
              }}
              style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
            >
              <Text style={styles.primaryText}>Next exercise</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={onFinish}
              disabled={finishing}
              style={({ pressed }) => [
                styles.primary,
                pressed && styles.primaryPressed,
                finishing && styles.primaryDisabled,
              ]}
            >
              {finishing ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.primaryText}>Finish session</Text>
              )}
            </Pressable>
          )}
        </View>
      </ScrollView>

      <AdjustSheet
        visible={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        sessionId={session.id}
        exerciseIndex={currentIndex}
        originalName={current.name}
        onAccept={(suggestion) => applyAdjust(suggestion, current.name)}
      />
    </KeyboardAvoidingView>
  );
}

function firstIncompleteIndex(exercises: ExerciseLog[]): number {
  for (let i = 0; i < exercises.length; i++) {
    const e = exercises[i];
    if (!e) continue;
    if (!e.skipped && e.sets.length < e.plannedSets) return i;
  }
  return Math.max(0, exercises.length - 1);
}

function RestTimerBanner({
  secondsLeft,
  onSkip,
}: {
  secondsLeft: number;
  onSkip: () => void;
}) {
  const label = secondsLeft >= 60 ? `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}` : `${secondsLeft}s`;
  return (
    <Pressable
      onPress={onSkip}
      style={({ pressed }) => [styles.restBanner, pressed && styles.restBannerPressed]}
    >
      <Text style={styles.restLabel}>Rest</Text>
      <Text style={styles.restTime}>{label}</Text>
      <Text style={styles.restHint}>tap to skip</Text>
    </Pressable>
  );
}

function ExerciseFocus({
  exercise,
  onSwap,
  onSkip,
}: {
  exercise: ExerciseLog;
  onSwap: () => void;
  onSkip: () => void;
}) {
  return (
    <View style={styles.focusCard}>
      <Text style={styles.focusName}>{exercise.name}</Text>
      <Text style={styles.focusSpec}>
        {exercise.plannedSets} × {exercise.plannedReps} · {exercise.plannedRestSeconds}s rest
      </Text>
      {exercise.substitutedFor ? (
        <Text style={styles.substituted}>swapped from {exercise.substitutedFor}</Text>
      ) : null}
      {exercise.notes ? <Text style={styles.focusNotes}>{exercise.notes}</Text> : null}
      <View style={styles.focusActions}>
        <Pressable
          onPress={onSwap}
          style={({ pressed }) => [styles.ghost, pressed && styles.ghostPressed]}
        >
          <Text style={styles.ghostText}>Swap</Text>
        </Pressable>
        <Pressable
          onPress={onSkip}
          style={({ pressed }) => [styles.ghost, pressed && styles.ghostPressed]}
        >
          <Text style={styles.ghostText}>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SetLogger({
  current,
  onLogSet,
  onRemoveLast,
}: {
  current: ExerciseLog;
  onLogSet: (s: SetLog) => void;
  onRemoveLast: () => void;
}) {
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [rpe, setRpe] = useState("");
  const doneSets = current.sets.length;
  const remaining = Math.max(0, current.plannedSets - doneSets);

  const canLog = reps.trim().length > 0 && Number(reps) > 0;

  const log = () => {
    if (!canLog) return;
    const set: SetLog = { reps: Math.max(0, Math.round(Number(reps))) };
    const w = Number(weight);
    if (weight.trim() && !Number.isNaN(w) && w >= 0) set.weightKg = w;
    const r = Number(rpe);
    if (rpe.trim() && !Number.isNaN(r) && r >= 1 && r <= 10) set.rpe = r;
    onLogSet(set);
    setReps("");
  };

  return (
    <View style={styles.setCard}>
      <View style={styles.setCounterRow}>
        <Text style={styles.setCounterText}>
          {doneSets}/{current.plannedSets} sets logged
        </Text>
        {doneSets > 0 ? (
          <Pressable onPress={onRemoveLast}>
            <Text style={styles.undo}>Undo last</Text>
          </Pressable>
        ) : null}
      </View>

      {current.sets.length > 0 ? (
        <View style={styles.setsList}>
          {current.sets.map((s, i) => (
            <View key={i} style={styles.setRow}>
              <Text style={styles.setRowNumber}>#{i + 1}</Text>
              <Text style={styles.setRowSpec}>
                {s.reps} reps
                {s.weightKg !== undefined ? ` · ${s.weightKg} kg` : ""}
                {s.rpe !== undefined ? ` · RPE ${s.rpe}` : ""}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.inputsRow}>
        <Field label="Reps" value={reps} onChangeText={setReps} placeholder="8" />
        <Field label="Weight kg" value={weight} onChangeText={setWeight} placeholder="20" />
        <Field label="RPE" value={rpe} onChangeText={setRpe} placeholder="7" />
      </View>

      <Pressable
        onPress={log}
        disabled={!canLog}
        style={({ pressed }) => [
          styles.logSet,
          pressed && styles.logSetPressed,
          !canLog && styles.logSetDisabled,
        ]}
      >
        <Text style={styles.logSetText}>
          {remaining > 0 ? `Log set (${remaining} left)` : "Log extra set"}
        </Text>
      </Pressable>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType="decimal-pad"
        style={styles.fieldInput}
      />
    </View>
  );
}

function ExerciseList({
  exercises,
  currentIndex,
  onTap,
}: {
  exercises: ExerciseLog[];
  currentIndex: number;
  onTap: (i: number) => void;
}) {
  return (
    <View style={styles.list}>
      {exercises.map((e, i) => (
        <Pressable
          key={i}
          onPress={() => onTap(i)}
          style={({ pressed }) => [
            styles.listRow,
            i === currentIndex && styles.listRowActive,
            pressed && styles.listRowPressed,
          ]}
        >
          <Text style={styles.listRowIndex}>#{i + 1}</Text>
          <Text style={styles.listRowName} numberOfLines={1}>
            {e.name}
          </Text>
          <Text style={styles.listRowCounts}>
            {e.skipped ? "skip" : `${e.sets.length}/${e.plannedSets}`}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function SessionSummary({
  session,
  onDone,
}: {
  session: SessionLog;
  onDone: () => void;
}) {
  const totalSets = session.exercises.reduce((acc, e) => acc + e.sets.length, 0);
  const totalPlannedSets = session.exercises.reduce((acc, e) => acc + e.plannedSets, 0);
  const totalReps = session.exercises.reduce(
    (acc, e) => acc + e.sets.reduce((a, s) => a + s.reps, 0),
    0,
  );
  const totalVolume = session.exercises.reduce(
    (acc, e) => acc + e.sets.reduce((a, s) => a + (s.weightKg ?? 0) * s.reps, 0),
    0,
  );
  const skippedCount = session.exercises.filter((e) => e.skipped).length;
  const swappedCount = session.exercises.filter((e) => e.substitutedFor).length;
  const elapsedMs = (session.completedAt ?? Date.now()) - session.startedAt;
  const elapsedMin = Math.round(elapsedMs / 60000);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.summaryContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.summaryHero}>
        <Text style={styles.summaryEyebrow}>Session complete</Text>
        <Text style={styles.summaryTitle}>{session.sessionTitle}</Text>
        <Text style={styles.summaryTime}>{elapsedMin} min</Text>
      </View>

      <View style={styles.statsGrid}>
        <StatTile label="Sets logged" value={`${totalSets}`} hint={`of ${totalPlannedSets}`} />
        <StatTile label="Total reps" value={`${totalReps}`} />
        {totalVolume > 0 ? (
          <StatTile
            label="Volume"
            value={`${formatVolume(totalVolume)}`}
            hint="kg × reps"
          />
        ) : null}
        {swappedCount > 0 ? (
          <StatTile label="Swapped" value={`${swappedCount}`} hint="exercises" />
        ) : null}
        {skippedCount > 0 ? (
          <StatTile label="Skipped" value={`${skippedCount}`} hint="exercises" />
        ) : null}
      </View>

      <View style={styles.breakdownCard}>
        <Text style={styles.breakdownTitle}>Breakdown</Text>
        {session.exercises.map((e, i) => (
          <View key={i} style={styles.breakdownRow}>
            <View style={styles.breakdownMain}>
              <Text style={styles.breakdownName}>{e.name}</Text>
              {e.substitutedFor ? (
                <Text style={styles.breakdownSub}>swapped from {e.substitutedFor}</Text>
              ) : null}
            </View>
            <Text style={styles.breakdownCounts}>
              {e.skipped ? "skip" : `${e.sets.length}/${e.plannedSets}`}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={onDone}
        style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
      >
        <Text style={styles.primaryText}>Back to plan</Text>
      </Pressable>
    </ScrollView>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={styles.statHint}>{hint}</Text> : null}
    </View>
  );
}

function formatVolume(v: number): string {
  if (v >= 1000) return `${Math.round(v / 100) / 10}k`;
  return `${Math.round(v)}`;
}

function AdjustSheet({
  visible,
  onClose,
  sessionId,
  exerciseIndex,
  originalName,
  onAccept,
}: {
  visible: boolean;
  onClose: () => void;
  sessionId: string;
  exerciseIndex: number;
  originalName: string;
  onAccept: (suggestion: Exercise) => void;
}) {
  const [reason, setReason] = useState<AdjustReason | null>(null);
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdjustSessionResponse | null>(null);

  const close = () => {
    setReason(null);
    setDetails("");
    setLoading(false);
    setResult(null);
    onClose();
  };

  const submit = async () => {
    if (!reason) return;
    setLoading(true);
    try {
      const res = await adjustSession(sessionId, { exerciseIndex, reason, details });
      setResult(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : "could not suggest";
      Alert.alert("Swap failed", message);
    } finally {
      setLoading(false);
    }
  };

  const accept = () => {
    if (!result) return;
    onAccept(result.suggestion);
    close();
  };

  const reasons: { value: AdjustReason; label: string }[] = useMemo(
    () => [
      { value: "missing_equipment", label: "Equipment not available" },
      { value: "crowded_gym", label: "Machine is busy" },
      { value: "not_feeling_it", label: "Not feeling this move" },
      { value: "other", label: "Something else" },
    ],
    [],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.modalBackdrop} onPress={close} />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Swap {originalName}</Text>

        {!result ? (
          <>
            <Text style={styles.sheetSubtitle}>Why?</Text>
            <View style={styles.reasonList}>
              {reasons.map((r) => (
                <Pressable
                  key={r.value}
                  onPress={() => setReason(r.value)}
                  style={({ pressed }) => [
                    styles.reasonRow,
                    reason === r.value && styles.reasonRowActive,
                    pressed && styles.reasonRowPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.reasonText,
                      reason === r.value && styles.reasonTextActive,
                    ]}
                  >
                    {r.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {reason === "other" ? (
              <TextInput
                value={details}
                onChangeText={setDetails}
                placeholder="One line — what's going on?"
                placeholderTextColor={colors.textMuted}
                style={styles.sheetInput}
              />
            ) : null}
            <Pressable
              onPress={submit}
              disabled={!reason || loading}
              style={({ pressed }) => [
                styles.primary,
                pressed && styles.primaryPressed,
                (!reason || loading) && styles.primaryDisabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.primaryText}>Suggest alternative</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.sheetSubtitle}>Suggestion</Text>
            <View style={styles.suggestionCard}>
              <Text style={styles.suggestionName}>{result.suggestion.name}</Text>
              <Text style={styles.suggestionSpec}>
                {result.suggestion.sets} × {result.suggestion.reps} ·{" "}
                {result.suggestion.restSeconds}s rest
              </Text>
              {result.suggestion.notes ? (
                <Text style={styles.suggestionNotes}>{result.suggestion.notes}</Text>
              ) : null}
              <Text style={styles.suggestionRationale}>{result.rationale}</Text>
            </View>
            <View style={styles.sheetButtonsRow}>
              <Pressable
                onPress={close}
                style={({ pressed }) => [styles.ghost, pressed && styles.ghostPressed]}
              >
                <Text style={styles.ghostText}>Keep original</Text>
              </Pressable>
              <Pressable
                onPress={accept}
                style={({ pressed }) => [
                  styles.primary,
                  styles.primaryShort,
                  pressed && styles.primaryPressed,
                ]}
              >
                <Text style={styles.primaryText}>Use swap</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  root: { flex: 1, backgroundColor: colors.bg },
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
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "800",
  },
  progress: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: -4,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  restBanner: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 10,
  },
  restBannerPressed: {
    opacity: 0.7,
  },
  restLabel: {
    color: colors.warning,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "900",
  },
  restTime: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  restHint: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginLeft: "auto",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  focusCard: {
    backgroundColor: colors.surfaceElevated,
    padding: 22,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  focusName: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  focusSpec: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 6,
    fontWeight: "600",
  },
  substituted: {
    color: colors.warning,
    fontSize: 12,
    marginTop: 4,
    fontWeight: "700",
  },
  focusNotes: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: "italic",
    marginTop: 8,
    lineHeight: 19,
  },
  focusActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  setCard: {
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  setCounterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  setCounterText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  undo: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  setsList: {
    gap: 6,
  },
  setRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  setRowNumber: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    minWidth: 28,
  },
  setRowSpec: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  inputsRow: {
    flexDirection: "row",
    gap: 10,
  },
  field: { flex: 1, gap: 4 },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontWeight: "800",
  },
  fieldInput: {
    color: colors.text,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  logSet: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  logSetPressed: { backgroundColor: colors.accentPressed },
  logSetDisabled: { opacity: 0.5 },
  logSetText: { color: colors.text, fontWeight: "800", letterSpacing: 0.3 },
  list: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  listRowActive: { backgroundColor: colors.surfaceElevated },
  listRowPressed: { opacity: 0.7 },
  listRowIndex: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    minWidth: 28,
  },
  listRowName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
    flex: 1,
  },
  listRowCounts: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  footer: {
    marginTop: 4,
  },
  primary: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryPressed: { backgroundColor: colors.accentPressed },
  primaryDisabled: { opacity: 0.5 },
  primaryShort: { flex: 1, paddingVertical: 12 },
  primaryText: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 15,
    letterSpacing: 0.3,
  },
  ghost: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostPressed: { backgroundColor: colors.surface },
  ghostText: {
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 13,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderColor: colors.border,
    gap: 14,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 6,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  sheetSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "800",
  },
  reasonList: { gap: 8 },
  reasonRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  reasonRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceElevated,
  },
  reasonRowPressed: { opacity: 0.8 },
  reasonText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  reasonTextActive: {
    color: colors.accent,
  },
  sheetInput: {
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  suggestionCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: 16,
    gap: 6,
  },
  suggestionName: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: -0.2,
  },
  suggestionSpec: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  suggestionNotes: {
    color: colors.textMuted,
    fontSize: 13,
    fontStyle: "italic",
    marginTop: 4,
  },
  suggestionRationale: {
    color: colors.text,
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  sheetButtonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  summaryContent: {
    padding: 20,
    paddingBottom: 40,
    gap: 16,
  },
  summaryHero: {
    backgroundColor: colors.surfaceElevated,
    padding: 24,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.success,
    gap: 6,
  },
  summaryEyebrow: {
    color: colors.success,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: "900",
  },
  summaryTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.6,
    marginTop: 2,
  },
  summaryTime: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statTile: {
    flexBasis: "47%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontWeight: "800",
  },
  statValue: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900",
    marginTop: 6,
    letterSpacing: -0.5,
  },
  statHint: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    fontWeight: "700",
  },
  breakdownCard: {
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  breakdownTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  breakdownMain: { flex: 1 },
  breakdownName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  breakdownSub: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  breakdownCounts: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
});
