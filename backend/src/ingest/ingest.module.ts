import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AlertsModule } from '../alerts/alerts.module.js';
import { CamerasModule } from '../cameras/cameras.module.js';
import { IngestController } from './ingest.controller.js';
import { HmacIngestGuard } from './hmac.guard.js';
import { IngestAlertService } from './ingest-alert.service.js';

@Module({
  imports: [PrismaModule, AlertsModule, CamerasModule],
  controllers: [IngestController],
  providers: [HmacIngestGuard, IngestAlertService],
})
export class IngestModule {}
