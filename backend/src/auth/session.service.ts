import {
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ServerSession, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_REFRESH_WINDOW_SECONDS,
  DEFAULT_SESSION_TTL_SECONDS,
} from './auth.constants';
import {
  createSignedSessionToken,
  verifySignedSessionToken,
} from './signed-token';
import type { AuthenticatedUser } from './auth.types';

export interface ValidSession {
  session: ServerSession;
  user: AuthenticatedUser;
  rotatedToken: string | null;
  maxAgeSeconds: number;
}

@Injectable()
export class SessionService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    this.sessionSecret();
  }

  async createSession(
    user: Pick<
      User,
      'id' | 'facilityId' | 'role' | 'kakaoId' | 'nickname' | 'sessionVersion'
    >,
  ): Promise<{ token: string; maxAgeSeconds: number; session: ServerSession }> {
    const ttlSeconds = this.sessionTtlSeconds();
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresAt = new Date((nowSeconds + ttlSeconds) * 1000);
    const session = await this.prisma.db.serverSession.create({
      data: { userId: user.id, facilityId: user.facilityId, expiresAt },
    });
    const token = createSignedSessionToken(
      {
        sessionId: session.id,
        userId: user.id,
        facilityId: user.facilityId,
        sessionVersion: user.sessionVersion,
        iat: nowSeconds,
        exp: nowSeconds + ttlSeconds,
      },
      this.sessionSecret(),
    );
    return { token, maxAgeSeconds: ttlSeconds, session };
  }

  async validateToken(
    token: string | undefined,
    options: { rotate?: boolean } = {},
  ): Promise<ValidSession> {
    if (!token) throw new UnauthorizedException('Missing session');
    const payload = verifySignedSessionToken(token, this.sessionSecret());
    if (!payload) throw new UnauthorizedException('Invalid session');

    const session = await this.prisma.db.serverSession.findUnique({
      where: { id: payload.sessionId },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date())
      throw new UnauthorizedException('Expired session');

    const user = await this.prisma.db.user.findUnique({
      where: { id: payload.userId },
    });
    if (!user || user.sessionVersion !== payload.sessionVersion)
      throw new UnauthorizedException('Stale session');
    if (
      user.facilityId !== payload.facilityId ||
      session.facilityId !== payload.facilityId
    )
      throw new UnauthorizedException('Session facility mismatch');
    let activeSession = session;

    let rotatedToken: string | null = null;
    if (options.rotate !== false && this.shouldRotate(payload.iat)) {
      await this.prisma.db.serverSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      const rotated = await this.createSession(user);
      rotatedToken = rotated.token;
      activeSession = rotated.session;
    }

    return {
      session: activeSession,
      user: toAuthenticatedUser(user),
      rotatedToken,
      maxAgeSeconds: this.sessionTtlSeconds(),
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.db.serverSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }
  /**
   * Lightweight re-auth check for SSE re-auth tick (F6/AC4).
   * Returns false if the session is revoked, expired, or the user's
   * sessionVersion has been bumped (invalidating all prior tokens).
   * Does NOT rotate the session.
   */
  async checkActive(
    sessionId: string,
    expectedSessionVersion: number,
  ): Promise<boolean> {
    const session = await this.prisma.db.serverSession.findUnique({
      where: { id: sessionId },
      select: { revokedAt: true, expiresAt: true, userId: true },
    });
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date()
    ) {
      return false;
    }
    const user = await this.prisma.db.user.findUnique({
      where: { id: session.userId },
      select: { sessionVersion: true },
    });
    return user !== null && user.sessionVersion === expectedSessionVersion;
  }

  private shouldRotate(iat: number): boolean {
    return Math.floor(Date.now() / 1000) - iat >= this.refreshWindowSeconds();
  }

  private sessionSecret(): string {
    const secret = this.config.get<string>('SESSION_JWT_SECRET');
    if (!secret || secret.length < 32)
      throw new ServiceUnavailableException(
        'SESSION_JWT_SECRET must be at least 32 characters',
      );
    return secret;
  }

  private sessionTtlSeconds(): number {
    return positiveInt(
      this.config.get<string>('SESSION_TTL_SECONDS'),
      DEFAULT_SESSION_TTL_SECONDS,
    );
  }

  private refreshWindowSeconds(): number {
    return positiveInt(
      this.config.get<string>('SESSION_REFRESH_WINDOW_SECONDS'),
      DEFAULT_REFRESH_WINDOW_SECONDS,
    );
  }
}

function positiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toAuthenticatedUser(
  user: Pick<
    User,
    'id' | 'facilityId' | 'role' | 'kakaoId' | 'nickname' | 'sessionVersion'
  >,
): AuthenticatedUser {
  return {
    id: user.id,
    facilityId: user.facilityId,
    role: user.role,
    kakaoId: user.kakaoId,
    nickname: user.nickname,
    sessionVersion: user.sessionVersion,
  };
}
