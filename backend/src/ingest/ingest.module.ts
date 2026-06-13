import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AlertsModule } from '../alerts/alerts.module.js';
import { IngestController } from './ingest.controller.js';
import { HmacIngestGuard } from './hmac.guard.js';

@Module({
  imports: [PrismaModule, AlertsModule],
  controllers: [IngestController],
  providers: [HmacIngestGuard],
})
export class IngestModule {}
