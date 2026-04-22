import { useAuthRequest } from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";

WebBrowser.maybeCompleteAuthSession();

export interface GoogleTokens {
  idToken: string;
}

export interface UseGoogleSignInResult {
  promptAsync: () => Promise<GoogleTokens | null>;
  ready: boolean;
}

export function useGoogleSignIn(): UseGoogleSignInResult {
  const [request, response, promptAsync] = useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID,
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB,
    scopes: ["openid", "profile", "email"],
  });

  useEffect(() => {
    // response is observed by callers via the promise returned from `prompt`
  }, [response]);

  return {
    ready: !!request,
    async promptAsync() {
      const result = await promptAsync();
      if (result.type !== "success") return null;
      const idToken =
        (result.params as Record<string, string | undefined>).id_token ??
        (result.authentication as { idToken?: string } | null)?.idToken;
      if (!idToken) return null;
      return { idToken };
    },
  };
}
