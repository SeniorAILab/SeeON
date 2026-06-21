import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SpaceStatusesController } from './controllers/space-statuses.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [SpaceStatusesController],
})
export class SpaceStatusesModule {}
