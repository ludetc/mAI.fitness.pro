import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useGoogleSignIn } from "../src/lib/auth";
import { useAuth } from "../src/providers/AuthProvider";
import { colors } from "../src/theme/colors";

export default function SignInScreen() {
  const { ready, promptAsync } = useGoogleSignIn();
  const { signInWithIdToken } = useAuth();
  const [pending, setPending] = useState(false);

  const onPress = async () => {
    if (!ready || pending) return;
    setPending(true);
    try {
      const tokens = await promptAsync();
      if (!tokens) {
        setPending(false);
        return;
      }
      await signInWithIdToken(tokens.idToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : "sign-in failed";
      Alert.alert("Sign-in failed", message);
    } finally {
      setPending(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.brand}>mAI.fitness</Text>
        <Text style={styles.tagline}>No excuses. Just the work.</Text>
      </View>
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
            (!ready || pending) && styles.buttonDisabled,
          ]}
          onPress={onPress}
          disabled={!ready || pending}
        >
          {pending ? (
            <ActivityIndicator color={colors.text} />
          ) : (
            <Text style={styles.buttonText}>Continue with Google</Text>
          )}
        </Pressable>
        <Text style={styles.fineprint}>
          By continuing you agree that we can destroy your previous excuses.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  header: {
    marginTop: 80,
  },
  brand: {
    color: colors.text,
    fontSize: 42,
    fontWeight: "900",
    letterSpacing: -1,
  },
  tagline: {
    color: colors.textMuted,
    fontSize: 16,
    marginTop: 12,
    fontWeight: "600",
  },
  footer: {
    paddingBottom: 24,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonPressed: {
    backgroundColor: colors.accentPressed,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  fineprint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 16,
    textAlign: "center",
  },
});
