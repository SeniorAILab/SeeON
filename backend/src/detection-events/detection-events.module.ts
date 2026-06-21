import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DetectionEventsController } from './controllers/detection-events.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [DetectionEventsController],
})
export class DetectionEventsModule {}
