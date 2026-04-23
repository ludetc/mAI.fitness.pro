import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "mai.session.jwt";

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return localStorage.getItem(KEY);
  }
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.setItem(KEY, token);
    return;
  }
  await SecureStore.setItemAsync(KEY, token);
}

export async function clearToken(): Promise<void> {
  if (Platform.OS === "web") {
    localStorage.removeItem(KEY);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // ignore
  }
}
