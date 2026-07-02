import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SESSION_COOKIE_NAME } from './auth.constants';
import { readCookie, setSessionCookie } from './cookie.util';
import { SessionService } from './session.service';
import type { AuthenticatedUser } from './auth.types';

// Express Request already provides headers: IncomingHttpHeaders which is wider
// than AuthenticatedRequest.headers — extending both causes an incompatible
// intersection. We include the auth-specific fields directly instead.
export interface RequestWithAuth extends Request {
  user?: AuthenticatedUser;
  sessionId?: string;
  activeFacilityId?: string | null;
  rotatedSessionToken?: string | null;
  rotatedFromSessionId?: string | null;
  rotatedSessionMaxAgeSeconds?: number;
  effectiveFacilityId?: string;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithAuth>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE_NAME);
    const valid = await this.sessions.validateToken(token);
    request.user = valid.user;
    request.sessionId = valid.session.id;
    request.activeFacilityId = valid.session.activeFacilityId ?? null;
    request.rotatedSessionToken = valid.rotatedToken;
    request.rotatedFromSessionId = valid.rotatedFromSessionId;
    request.rotatedSessionMaxAgeSeconds = valid.maxAgeSeconds;
    if (valid.rotatedToken) {
      setSessionCookie(
        http.getResponse<Response>(),
        valid.rotatedToken,
        valid.maxAgeSeconds,
      );
    }
    return true;
  }
}

@Injectable()
export class RequireFacilityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    if (!request.user) throw new UnauthorizedException('Missing session');
    if (request.user.facilityId) {
      request.effectiveFacilityId = request.user.facilityId;
      return true;
    }
    if (request.user.role === 'SUPER_ADMIN' && request.activeFacilityId) {
      request.effectiveFacilityId = request.activeFacilityId;
      return true;
    }
    throw new ForbiddenException('Facility onboarding required');
  }
}
