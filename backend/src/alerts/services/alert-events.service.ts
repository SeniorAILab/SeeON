import { randomUUID } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  AlertAuditRecordDto,
  AlertEventIngressDto,
  AlertEventResponseDto,
} from '../dto/alert-events.dto';
import { AlertChannelService } from './alert-channel.service';
import { AlertPolicyService } from './alert-policy.service';

const DEFAULT_ALERT_VAR_DIR = join(process.cwd(), 'var');

@Injectable()
export class AlertEventsService implements OnModuleInit {
  private auditWriteQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly configService: ConfigService,
    private readonly alertPolicyService: AlertPolicyService,
    private readonly alertChannelService: AlertChannelService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureAuditFile();
  }

  async ingest(event: AlertEventIngressDto): Promise<AlertEventResponseDto> {
    const eventId = randomUUID();
    const receivedAt = new Date().toISOString();
    const policyDecision = this.alertPolicyService.evaluate(event);
    if (policyDecision.kind === 'suppress') {
      await this.appendAudit({
        ...event,
        event_id: eventId,
        received_at: receivedAt,
        suppressed_reason: policyDecision.suppressed_reason,
      });

      return { event_id: eventId };
    }

    const forwardedAt = new Date().toISOString();
    const channelPayload = {
      ...event,
      event_id: eventId,
      received_at: receivedAt,
      forwarded_at: forwardedAt,
    };
    const dispatchResult =
      await this.alertChannelService.dispatch(channelPayload);
    await this.appendAudit({
      ...channelPayload,
      ...dispatchResult,
    });

    return { event_id: eventId };
  }

  private async appendAudit(record: AlertAuditRecordDto): Promise<void> {
    const auditFile = join(this.alertVarDir(), 'audit.jsonl');
    const nextWrite = this.auditWriteQueue.then(async () => {
      await this.ensureAuditFile();
      await appendFile(auditFile, `${JSON.stringify(record)}\n`, 'utf8');
    });
    this.auditWriteQueue = nextWrite.catch((error: unknown) => {
      if (error instanceof Error) {
        return;
      }
      throw error;
    });
    await nextWrite;
  }

  private alertVarDir(): string {
    return (
      this.configService.get<string>('ALERT_VAR_DIR') ?? DEFAULT_ALERT_VAR_DIR
    );
  }

  private async ensureAuditFile(): Promise<void> {
    await mkdir(this.alertVarDir(), { recursive: true });
    await appendFile(join(this.alertVarDir(), 'audit.jsonl'), '', 'utf8');
  }
}
