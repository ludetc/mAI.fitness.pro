import { Stack } from "expo-router";
import { colors } from "../../src/theme/colors";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { fontWeight: "800" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "mAI.fitness" }} />
      <Stack.Screen name="onboarding" options={{ title: "Discovery", headerBackTitle: "" }} />
      <Stack.Screen name="plan" options={{ title: "Your plan", headerBackTitle: "" }} />
      <Stack.Screen name="session" options={{ title: "Session", headerBackTitle: "" }} />
    </Stack>
  );
}
