import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ResidentRiskSummariesController } from './controllers/resident-risk-summaries.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [ResidentRiskSummariesController],
})
export class ResidentRiskSummariesModule {}
