/**
 * GET /api/sse — SSE event stream (F3/F8/F10/F13).
 *
 * Auth: SessionGuard + RequireOrgGuard (same as data routes).
 * Last-Event-ID: parsed as bigint alertSeq. On reconnect:
 *   1. Replay org-scoped alerts WHERE alertSeq > lastEventId ORDER BY alertSeq.
 *   2. REST-snapshot ResidentStatus current state.
 *   3. Live events stream via AlertWriterService.subscribe.
 *
 * F10 (no buffering): sets X-Accel-Buffering: no, Cache-Control: no-cache.
 * F13: SSE id field = alertSeq (bigint), NOT the cuid pk.
 *
 * Connection kept alive with 20 s comment heartbeats.
 * SSE closes when client disconnects (req 'close' event).
 */
import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RequireOrgGuard, SessionGuard } from '../auth/session.guard.js';
import type { RequestWithAuth } from '../auth/session.guard.js';
import { AlertWriterService } from '../alerts/alert-writer.service.js';
import type { AlertEvent } from '../alerts/alert-writer.service.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { StatusService } from '../status/status.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const HEARTBEAT_MS = 20_000;

@Controller()
@UseGuards(SessionGuard, RequireOrgGuard)
export class SseController {
  constructor(
    private readonly writer: AlertWriterService,
    private readonly alerts: AlertsService,
    private readonly status: StatusService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('api/sse')
  @Header('content-type', 'text/event-stream')
  @Header('cache-control', 'no-cache')
  @Header('connection', 'keep-alive')
  @Header('x-accel-buffering', 'no') // F10: disable Nginx/proxy buffering
  async sse(@Req() req: RequestWithAuth, @Res() res: Response): Promise<void> {
    const orgId = requireOrgId(req);

    res.flushHeaders();

    const write = (chunk: string) => {
      try {
        res.write(chunk);
        // Flush if available (compression/buffering bypass).
        if (
          typeof (res as unknown as { flush?: () => void }).flush === 'function'
        ) {
          (res as unknown as { flush: () => void }).flush();
        }
      } catch {
        // ignore write errors (client disconnected)
      }
    };

    // Initial comment to establish connection.
    write(': connected\n\n');

    // Replay backlog (F8 Last-Event-ID).
    const lastEventIdHeader = req.headers['last-event-id'];
    if (lastEventIdHeader) {
      try {
        const lastSeq = BigInt(String(lastEventIdHeader));
        const backlog = await this.alerts.replay(orgId, lastSeq);
        for (const alert of backlog) {
          write(
            formatSseEvent(alert.alertSeq, {
              alertSeq: alert.alertSeq.toString(),
              id: alert.id,
              orgId: alert.orgId,
              residentId: alert.residentId,
              cameraId: alert.cameraId,
              type: alert.type,
              probability: alert.probability,
              detectedAt: alert.detectedAt,
              status: alert.status,
            }),
          );
        }
      } catch {
        // invalid Last-Event-ID → skip replay
      }
    }

    // F8: REST re-snapshot of current ResidentStatus on reconnect.
    try {
      const statuses = await this.status.listByOrg(orgId);
      write(`event: status-snapshot\ndata: ${JSON.stringify(statuses)}\n\n`);
    } catch {
      // non-fatal
    }

    // Subscribe to live events.
    const unsub = this.writer.subscribe(orgId, (event: AlertEvent) => {
      write(
        formatSseEvent(event.alertSeq, {
          alertSeq: event.alertSeq.toString(),
          id: event.id,
          orgId: event.orgId,
          residentId: event.residentId,
          cameraId: event.cameraId,
          type: event.type,
          probability: event.probability,
          detectedAt: event.detectedAt,
          status: event.status,
        }),
      );
    });

    // Heartbeat to keep connection alive.
    const heartbeat = setInterval(() => write(': heartbeat\n\n'), HEARTBEAT_MS);

    // Cleanup on client disconnect.
    const cleanup = () => {
      clearInterval(heartbeat);
      unsub();
      try {
        res.end();
      } catch {
        /* ignore */
      }
    };

    req.socket.on('close', cleanup);
    req.on('close', cleanup);
  }
}

function formatSseEvent(
  alertSeq: bigint,
  data: Record<string, unknown>,
): string {
  return `id: ${alertSeq}\ndata: ${JSON.stringify(data)}\n\n`;
}

function requireOrgId(req: RequestWithAuth): string {
  const orgId = req.user?.orgId;
  if (!orgId) throw new ForbiddenException('Organization context required');
  return orgId;
}
