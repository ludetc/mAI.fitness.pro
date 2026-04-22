import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ChatMessage } from "@mai/shared";
import { sendOnboardingMessage, startOnboarding } from "../../src/lib/onboarding";
import { useAuth } from "../../src/providers/AuthProvider";
import { colors } from "../../src/theme/colors";

export default function OnboardingScreen() {
  const { refreshProfile } = useAuth();
  const router = useRouter();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [booting, setBooting] = useState(true);
  const [sending, setSending] = useState(false);
  const [completed, setCompleted] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await startOnboarding();
        if (cancelled) return;
        setConversationId(res.conversation.id);
        setMessages(res.messages);
        setCompleted(!!res.conversation.completedAt);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "could not load";
        Alert.alert("Onboarding failed to load", message);
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  useEffect(() => {
    if (messages.length > 0) scrollToEnd();
  }, [messages.length, scrollToEnd]);

  const onSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || !conversationId || sending || completed) return;
    setInput("");
    setSending(true);

    const optimistic: ChatMessage = {
      id: `optimistic-${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await sendOnboardingMessage(conversationId, trimmed);
      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== optimistic.id);
        return [...withoutOptimistic, ...res.messages];
      });
      if (res.completed) {
        setCompleted(true);
        await refreshProfile();
        setTimeout(() => {
          router.replace("/(app)");
        }, 1800);
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      const message = err instanceof Error ? err.message : "send failed";
      Alert.alert("Could not send", message);
    } finally {
      setSending(false);
    }
  }, [input, conversationId, sending, completed, refreshProfile, router]);

  if (booting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.list}
          onContentSizeChange={scrollToEnd}
        />
        {completed ? (
          <View style={styles.completedBar}>
            <Text style={styles.completedText}>Profile saved. Redirecting…</Text>
          </View>
        ) : (
          <View style={styles.inputBar}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Your turn…"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              multiline
              editable={!sending}
              onSubmitEditing={onSend}
              blurOnSubmit
            />
            <Pressable
              onPress={onSend}
              disabled={sending || !input.trim()}
              style={({ pressed }) => [
                styles.sendButton,
                pressed && styles.sendButtonPressed,
                (sending || !input.trim()) && styles.sendButtonDisabled,
              ]}
            >
              {sending ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={styles.sendText}>Send</Text>
              )}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAi]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
        <Text style={isUser ? styles.bubbleTextUser : styles.bubbleTextAi}>
          {message.content}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  list: {
    padding: 16,
    paddingBottom: 8,
  },
  bubbleRow: {
    marginVertical: 4,
    flexDirection: "row",
  },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubbleRowAi: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "86%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  bubbleUser: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleAi: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleTextUser: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 21,
  },
  bubbleTextAi: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
    gap: 10,
  },
  input: {
    flex: 1,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxHeight: 120,
    fontSize: 15,
  },
  sendButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 72,
  },
  sendButtonPressed: {
    backgroundColor: colors.accentPressed,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendText: {
    color: colors.text,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  completedBar: {
    padding: 18,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  completedText: {
    color: colors.success,
    fontWeight: "700",
  },
});
