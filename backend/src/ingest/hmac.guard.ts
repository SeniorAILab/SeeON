/**
 * HmacIngestGuard — verifies HMAC-SHA256 signature on ingest requests (F4).
 *
 * Expected headers:
 *   X-Ingest-Key-Id:   selector — identifies which camera/secret to use
 *   X-Signature:       hex HMAC-SHA256 over canonical body (see below)
 *   X-Ingest-Timestamp: ISO8601 or Unix ms string — freshness check
 *
 * Canonical message = `${resident_id}|${facility_id}|${type}|${detected_at}`
 * Signing key = camera.ingestSecretHash (stored HMAC key)
 *
 * On success, attaches `req.ingestCamera` with the verified camera row.
 * On failure, throws typed domain exceptions (InvalidSignatureException, etc.).
 */
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  InvalidSignatureException,
  StaleTimestampException,
  UnknownIngestKeyException,
} from '../common/domain-errors.js';

export interface IngestCameraInfo {
  id: string;
  orgId: string;
  residentId: string | null;
  ingestKeyId: string;
}

export interface RequestWithIngestCamera extends Request {
  ingestCamera?: IngestCameraInfo;
}

const FRESHNESS_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class HmacIngestGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithIngestCamera>();

    const keyId = request.headers['x-ingest-key-id'] as string | undefined;
    const signature = request.headers['x-signature'] as string | undefined;
    const tsHeader = request.headers['x-ingest-timestamp'] as
      | string
      | undefined;

    if (!keyId || !signature || !tsHeader)
      throw new InvalidSignatureException();

    // Freshness check on X-Ingest-Timestamp.
    const ts = isNaN(Number(tsHeader))
      ? new Date(tsHeader).getTime()
      : Number(tsHeader);
    if (isNaN(ts) || Math.abs(Date.now() - ts) > FRESHNESS_WINDOW_MS) {
      throw new StaleTimestampException();
    }

    // Look up camera via SECURITY DEFINER function (bypasses RLS for ingest path).
    type CameraRow = {
      id: string;
      orgId: string;
      residentId: string | null;
      ingestKeyId: string;
      ingestSecretHash: string;
    };
    const rows = await this.prisma.$queryRaw<CameraRow[]>`
      SELECT * FROM get_camera_for_ingest(${keyId}::text)
    `;
    if (!rows.length) throw new UnknownIngestKeyException();
    const camera = rows[0];

    // Verify HMAC.
    const body = request.body as {
      resident_id?: unknown;
      facility_id?: unknown;
      type?: unknown;
      detected_at?: unknown;
    };
    const canonical = [
      body.resident_id,
      body.facility_id,
      body.type,
      body.detected_at,
    ]
      .map(canonicalValue)
      .join('|');
    const expected = crypto
      .createHmac('sha256', camera.ingestSecretHash)
      .update(canonical)
      .digest('hex');

    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expected, 'hex'),
      )
    ) {
      throw new InvalidSignatureException();
    }

    request.ingestCamera = {
      id: camera.id,
      orgId: camera.orgId,
      residentId: camera.residentId,
      ingestKeyId: camera.ingestKeyId,
    };
    return true;
  }
}

function canonicalValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}
