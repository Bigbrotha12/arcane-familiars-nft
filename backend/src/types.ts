export interface Bindings {
  DB: D1Database;
  ENVIRONMENT: string;
}

export interface Variables {
  accountKey?: string;
  isGuest?: boolean;
  requestId?: string;
}
