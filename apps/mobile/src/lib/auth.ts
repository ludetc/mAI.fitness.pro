import { useAuthRequest } from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
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
    redirectUri: Linking.createURL("/"),
    responseType: "id_token",
  });

  useEffect(() => {
    if (response) {
      console.log("useGoogleSignIn: response type:", response.type);
      if (response.type === "error") {
        console.error("useGoogleSignIn: error details:", response.error);
      }
    }
  }, [response]);

  return {
    ready: !!request,
    async promptAsync() {
      console.log("useGoogleSignIn: starting promptAsync with redirectUri:", Linking.createURL("/"));
      const result = await promptAsync();
      console.log("useGoogleSignIn: result type:", result.type);
      
      if (result.type !== "success") {
        console.log("useGoogleSignIn: result was not success:", result);
        return null;
      }
      
      const idToken =
        (result.params as Record<string, string | undefined>).id_token ??
        (result.authentication as { idToken?: string } | null)?.idToken;
      
      if (!idToken) {
        console.warn("useGoogleSignIn: success but no idToken found in result.params or result.authentication");
        console.log("useGoogleSignIn: result.params:", result.params);
        console.log("useGoogleSignIn: result.authentication:", result.authentication);
        return null;
      }
      
      return { idToken };
    },
  };
}
