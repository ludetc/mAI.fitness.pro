import type {
  ChatMessage as PublicChatMessage,
  Conversation as PublicConversation,
  ExerciseLog,
  GoogleIdentity,
  Profile,
  SessionLog,
  StoredWorkoutPlan,
  User,
  WorkoutPlan,
} from "@mai/shared";
import type { ChatMessageText, ToolCall } from "./ai/index.js";

interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  name: string | null;
  picture: string | null;
  created_at: number;
  updated_at: number;
}

interface ConversationRow {
  id: string;
  user_id: string;
  kind: string;
  created_at: number;
  completed_at: number | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls: string | null;
  tool_call_id: string | null;
  created_at: number;
}

interface ProfileRow {
  user_id: string;
  data: string;
  created_at: number;
  updated_at: number;
}

// ----------------------- USERS -----------------------

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture,
  };
}

function newId(): string {
  return crypto.randomUUID();
}

export async function upsertUser(db: D1Database, identity: GoogleIdentity): Promise<User> {
  const now = Date.now();
  const existing = await db
    .prepare("SELECT * FROM users WHERE google_sub = ?")
    .bind(identity.sub)
    .first<UserRow>();

  if (existing) {
    await db
      .prepare(
        "UPDATE users SET email = ?, name = ?, picture = ?, updated_at = ? WHERE id = ?",
      )
      .bind(identity.email, identity.name, identity.picture, now, existing.id)
      .run();
    return rowToUser({
      ...existing,
      email: identity.email,
      name: identity.name,
      picture: identity.picture,
      updated_at: now,
    });
  }

  const id = newId();
  await db
    .prepare(
      "INSERT INTO users (id, google_sub, email, name, picture, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, identity.sub, identity.email, identity.name, identity.picture, now, now)
    .run();

  return {
    id,
    email: identity.email,
    name: identity.name,
    picture: identity.picture,
  };
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
  return row ? rowToUser(row) : null;
}

// ----------------------- CONVERSATIONS -----------------------

function rowToConversation(row: ConversationRow): PublicConversation {
  return {
    id: row.id,
    kind: row.kind as "onboarding",
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export async function createConversation(
  db: D1Database,
  userId: string,
  kind: string,
): Promise<PublicConversation> {
  const id = newId();
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO conversations (id, user_id, kind, created_at, completed_at) VALUES (?, ?, ?, ?, NULL)",
    )
    .bind(id, userId, kind, now)
    .run();
  return { id, kind: kind as "onboarding", createdAt: now, completedAt: null };
}

export async function getConversation(
  db: D1Database,
  id: string,
  userId: string,
): Promise<PublicConversation | null> {
  const row = await db
    .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<ConversationRow>();
  return row ? rowToConversation(row) : null;
}

export async function getLatestConversationByKind(
  db: D1Database,
  userId: string,
  kind: string,
): Promise<PublicConversation | null> {
  const row = await db
    .prepare(
      "SELECT * FROM conversations WHERE user_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 1",
    )
    .bind(userId, kind)
    .first<ConversationRow>();
  return row ? rowToConversation(row) : null;
}

export async function markConversationComplete(
  db: D1Database,
  id: string,
): Promise<void> {
  await db
    .prepare("UPDATE conversations SET completed_at = ? WHERE id = ?")
    .bind(Date.now(), id)
    .run();
}

// ----------------------- MESSAGES -----------------------

function rowToPublicMessage(row: MessageRow): PublicChatMessage | null {
  if (row.role !== "user" && row.role !== "assistant") return null;
  if (!row.content) return null;
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

function rowToChatMessageText(row: MessageRow): ChatMessageText {
  const toolCalls: ToolCall[] | undefined = row.tool_calls
    ? (safeJsonArray(row.tool_calls) as ToolCall[])
    : undefined;
  return {
    role: row.role,
    content: row.content,
    toolCalls,
    toolCallId: row.tool_call_id ?? undefined,
  };
}

function safeJsonArray(s: string): unknown[] {
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface InsertMessageInput {
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export async function addMessage(
  db: D1Database,
  conversationId: string,
  input: InsertMessageInput,
): Promise<PublicChatMessage> {
  const id = newId();
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO messages (id, conversation_id, role, content, tool_calls, tool_call_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      conversationId,
      input.role,
      input.content,
      input.toolCalls ? JSON.stringify(input.toolCalls) : null,
      input.toolCallId ?? null,
      now,
    )
    .run();
  return {
    id,
    role: input.role === "tool" ? "assistant" : input.role,
    content: input.content,
    createdAt: now,
  };
}

export async function listPublicMessages(
  db: D1Database,
  conversationId: string,
): Promise<PublicChatMessage[]> {
  const res = await db
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
    )
    .bind(conversationId)
    .all<MessageRow>();
  const rows = res.results ?? [];
  return rows
    .map(rowToPublicMessage)
    .filter((m): m is PublicChatMessage => m !== null);
}

export async function listRawMessages(
  db: D1Database,
  conversationId: string,
): Promise<ChatMessageText[]> {
  const res = await db
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
    )
    .bind(conversationId)
    .all<MessageRow>();
  const rows = res.results ?? [];
  return rows.map(rowToChatMessageText);
}

// ----------------------- PROFILES -----------------------

export async function upsertProfile(
  db: D1Database,
  userId: string,
  profile: Profile,
): Promise<Profile> {
  const now = Date.now();
  const data = JSON.stringify(profile);
  await db
    .prepare(
      `INSERT INTO profiles (user_id, data, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .bind(userId, data, now, now)
    .run();
  return profile;
}

export async function getProfile(db: D1Database, userId: string): Promise<Profile | null> {
  const row = await db
    .prepare("SELECT * FROM profiles WHERE user_id = ?")
    .bind(userId)
    .first<ProfileRow>();
  if (!row) return null;
  try {
    return JSON.parse(row.data) as Profile;
  } catch {
    return null;
  }
}

// ----------------------- WORKOUT PLANS -----------------------

interface WorkoutPlanRow {
  id: string;
  user_id: string;
  status: "active" | "archived";
  goal: string | null;
  data: string;
  created_at: number;
}

function rowToStoredPlan(row: WorkoutPlanRow): StoredWorkoutPlan | null {
  try {
    const plan = JSON.parse(row.data) as WorkoutPlan;
    return {
      id: row.id,
      status: row.status,
      goal: row.goal,
      plan,
      createdAt: row.created_at,
    };
  } catch {
    return null;
  }
}

export async function archiveActivePlans(db: D1Database, userId: string): Promise<void> {
  await db
    .prepare("UPDATE workout_plans SET status = 'archived' WHERE user_id = ? AND status = 'active'")
    .bind(userId)
    .run();
}

export async function createActivePlan(
  db: D1Database,
  userId: string,
  plan: WorkoutPlan,
  goal: string | null,
): Promise<StoredWorkoutPlan> {
  await archiveActivePlans(db, userId);
  const id = newId();
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO workout_plans (id, user_id, status, goal, data, created_at) VALUES (?, ?, 'active', ?, ?, ?)",
    )
    .bind(id, userId, goal, JSON.stringify(plan), now)
    .run();
  return { id, status: "active", goal, plan, createdAt: now };
}

export async function getActivePlan(
  db: D1Database,
  userId: string,
): Promise<StoredWorkoutPlan | null> {
  const row = await db
    .prepare(
      "SELECT * FROM workout_plans WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1",
    )
    .bind(userId)
    .first<WorkoutPlanRow>();
  return row ? rowToStoredPlan(row) : null;
}

export async function getPlanById(
  db: D1Database,
  userId: string,
  planId: string,
): Promise<StoredWorkoutPlan | null> {
  const row = await db
    .prepare("SELECT * FROM workout_plans WHERE id = ? AND user_id = ?")
    .bind(planId, userId)
    .first<WorkoutPlanRow>();
  return row ? rowToStoredPlan(row) : null;
}

// ----------------------- SESSION LOGS -----------------------

interface SessionLogRow {
  id: string;
  user_id: string;
  plan_id: string;
  session_index: number;
  session_title: string;
  started_at: number;
  completed_at: number | null;
  exercises: string;
  notes: string | null;
}

function rowToSessionLog(row: SessionLogRow): SessionLog | null {
  let exercises: ExerciseLog[];
  try {
    const parsed = JSON.parse(row.exercises);
    if (!Array.isArray(parsed)) return null;
    exercises = parsed as ExerciseLog[];
  } catch {
    return null;
  }
  return {
    id: row.id,
    planId: row.plan_id,
    sessionIndex: row.session_index,
    sessionTitle: row.session_title,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    exercises,
    notes: row.notes,
  };
}

export async function getActiveSessionLog(
  db: D1Database,
  userId: string,
): Promise<SessionLog | null> {
  const row = await db
    .prepare(
      "SELECT * FROM session_logs WHERE user_id = ? AND completed_at IS NULL ORDER BY started_at DESC LIMIT 1",
    )
    .bind(userId)
    .first<SessionLogRow>();
  return row ? rowToSessionLog(row) : null;
}

export async function getSessionLog(
  db: D1Database,
  userId: string,
  id: string,
): Promise<SessionLog | null> {
  const row = await db
    .prepare("SELECT * FROM session_logs WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<SessionLogRow>();
  return row ? rowToSessionLog(row) : null;
}

export async function createSessionLog(
  db: D1Database,
  args: {
    userId: string;
    planId: string;
    sessionIndex: number;
    sessionTitle: string;
    exercises: ExerciseLog[];
  },
): Promise<SessionLog> {
  const id = newId();
  const now = Date.now();
  await db
    .prepare(
      "INSERT INTO session_logs (id, user_id, plan_id, session_index, session_title, started_at, completed_at, exercises, notes) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL)",
    )
    .bind(
      id,
      args.userId,
      args.planId,
      args.sessionIndex,
      args.sessionTitle,
      now,
      JSON.stringify(args.exercises),
    )
    .run();
  return {
    id,
    planId: args.planId,
    sessionIndex: args.sessionIndex,
    sessionTitle: args.sessionTitle,
    startedAt: now,
    completedAt: null,
    exercises: args.exercises,
    notes: null,
  };
}

export async function updateSessionLogExercises(
  db: D1Database,
  userId: string,
  id: string,
  exercises: ExerciseLog[],
  notes: string | null,
): Promise<void> {
  await db
    .prepare(
      "UPDATE session_logs SET exercises = ?, notes = ? WHERE id = ? AND user_id = ? AND completed_at IS NULL",
    )
    .bind(JSON.stringify(exercises), notes, id, userId)
    .run();
}

export async function completeSessionLog(
  db: D1Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const res = await db
    .prepare(
      "UPDATE session_logs SET completed_at = ? WHERE id = ? AND user_id = ? AND completed_at IS NULL",
    )
    .bind(Date.now(), id, userId)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

export async function getRecentCompletedSessions(
  db: D1Database,
  userId: string,
  limit: number,
): Promise<SessionLog[]> {
  const safeLimit = Math.max(1, Math.min(50, Math.round(limit)));
  const res = await db
    .prepare(
      "SELECT * FROM session_logs WHERE user_id = ? AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT ?",
    )
    .bind(userId, safeLimit)
    .all<SessionLogRow>();
  const rows = res.results ?? [];
  return rows
    .map(rowToSessionLog)
    .filter((s): s is SessionLog => s !== null);
}
