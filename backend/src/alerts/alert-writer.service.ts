/**
 * AlertWriterService — serialized alert persistence + SSE emit (F3).
 *
 * All alert inserts funnel through `writeAlert()`. An in-process Promise chain
 * (mutex pattern) serializes inserts so alertSeq assignment, transaction
 * commit, and SSE emission happen in the same causal order.
 *
 * SSE clients subscribe via `subscribe(orgId, fn)` and receive emitted events
 * for their org. Unsubscribe by calling the returned cleanup function.
 */
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ResidentState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface AlertEvent {
  alertSeq: bigint;
  id: string;
  orgId: string;
  residentId: string;
  cameraId: string | null;
  type: string;
  probability: number;
  snapshotKey: string | null;
  detectedAt: Date;
  status: string;
}

export interface WriteAlertInput {
  orgId: string;
  residentId: string;
  cameraId: string | null;
  type: string;
  probability: number;
  snapshotKey: string | null;
  detectedAt: Date;
  idempotencyKey: string;
}

const CAMERA_ONLINE_TIMEOUT_MS = 30_000;

type Listener = (event: AlertEvent) => void;

@Injectable()
export class AlertWriterService {
  private readonly _listeners = new Map<string, Set<Listener>>();
  private _queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Subscribe to live SSE events for orgId.
   * Returns an unsubscribe function.
   */
  subscribe(orgId: string, fn: Listener): () => void {
    let listeners = this._listeners.get(orgId);
    if (!listeners) {
      listeners = new Set();
      this._listeners.set(orgId, listeners);
    }
    listeners.add(fn);
    return () => this._listeners.get(orgId)?.delete(fn);
  }

  /**
   * Enqueue an alert write. Returns the committed alert with its alertSeq.
   * Serialized: each call runs only after the previous one has committed.
   * F3: assign alertSeq + commit + emit happen in causal order.
   */
  writeAlert(input: WriteAlertInput): Promise<AlertEvent> {
    const next = this._queue.then(() => this._doWrite(input));
    // Swallow queue errors to prevent one failure from blocking the chain.
    this._queue = next.catch(() => undefined);
    return next;
  }

  private async _doWrite(input: WriteAlertInput): Promise<AlertEvent> {
    const {
      orgId,
      residentId,
      cameraId,
      type,
      probability,
      snapshotKey,
      detectedAt,
      idempotencyKey,
    } = input;

    // Determine new resident state from probability.
    const newState: ResidentState =
      probability >= 0.8
        ? ResidentState.FALL
        : probability >= 0.5
          ? ResidentState.WARNING
          : ResidentState.NORMAL;

    const now = new Date();
    const cameraOnline =
      now.getTime() - detectedAt.getTime() < CAMERA_ONLINE_TIMEOUT_MS;

    const alert = await this.prisma.withOrgContext(
      orgId,
      async (tx: Prisma.TransactionClient) => {
        const created = await tx.alert.create({
          data: {
            orgId,
            residentId,
            cameraId: cameraId ?? undefined,
            type,
            probability,
            snapshotKey,
            detectedAt,
            idempotencyKey,
          },
        });

        // Upsert ResidentStatus.
        await tx.residentStatus.upsert({
          where: { residentId },
          update: {
            state: newState,
            lastSeenAt: detectedAt,
            cameraOnline,
            sourceId: cameraId ?? undefined,
          },
          create: {
            residentId,
            orgId,
            state: newState,
            lastSeenAt: detectedAt,
            cameraOnline,
            sourceId: cameraId ?? undefined,
          },
        });

        return created;
      },
    );

    const event: AlertEvent = {
      alertSeq: alert.alertSeq,
      id: alert.id,
      orgId: alert.orgId,
      residentId: alert.residentId,
      cameraId: alert.cameraId,
      type: alert.type,
      probability: alert.probability,
      snapshotKey: alert.snapshotKey,
      detectedAt: alert.detectedAt,
      status: alert.status,
    };

    // Emit AFTER commit (F3).
    this._emit(orgId, event);
    return event;
  }

  private _emit(orgId: string, event: AlertEvent): void {
    const listeners = this._listeners.get(orgId);
    if (!listeners) return;
    for (const fn of listeners) {
      try {
        fn(event);
      } catch {
        // listener errors must not crash the writer
      }
    }
  }
}
