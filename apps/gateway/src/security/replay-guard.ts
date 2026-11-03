/**
 * Remembers token ids (JWT "jti") until they expire, so each token works exactly once.
 * In memory: correct for ONE gateway instance. Before scaling out, back this with Redis
 * (SET <jti> 1 NX EX <seconds>) so a token can't be replayed against a second instance.
 */
export class ReplayGuard {
  private readonly seen = new Map<string, number>(); // jti -> expiry (epoch ms)

  /** Returns false if this jti was already used; otherwise records it and returns true. */
  claim(jti: string, expiresAtMs: number): boolean {
    const now = Date.now();
    for (const [id, exp] of this.seen) if (exp < now) this.seen.delete(id);
    if (this.seen.has(jti)) return false;
    this.seen.set(jti, expiresAtMs);
    return true;
  }
}
