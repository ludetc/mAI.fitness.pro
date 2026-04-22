export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
  picture: string | null;
}
