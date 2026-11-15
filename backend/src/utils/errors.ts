/**
 * Typed client errors for conditions that are detected deep inside shared
 * helpers (saveManager) but must surface as a 4xx response from whichever
 * route called them. `internalError()` maps these before falling back to 500.
 */
export class ClientError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 409
  ) {
    super(message);
    this.name = 'ClientError';
  }
}

/**
 * A guest (no session) tried to read or write an account-keyed save. Guests may
 * only ever touch rows created by guest sessions (`is_anonymous = 1`).
 */
export class GuestAccountAccessError extends ClientError {
  constructor() {
    super('Guest session cannot access an account save', 403);
    this.name = 'GuestAccountAccessError';
  }
}

/**
 * A guest supplied an `anonymousId` that is not UUID-shaped. The game client
 * always generates UUIDs; anything else is malformed input.
 */
export class InvalidAccountIdError extends ClientError {
  constructor() {
    super('anonymousId must be a UUID', 400);
    this.name = 'InvalidAccountIdError';
  }
}
