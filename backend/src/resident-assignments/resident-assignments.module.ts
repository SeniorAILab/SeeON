import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { ResidentAssignmentsController } from './controllers/resident-assignments.controller.js';
import { ResidentAssignmentsRepository } from './repositories/resident-assignments.repository.js';
import { ResidentAssignmentsService } from './services/resident-assignments.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ResidentAssignmentsController],
  providers: [ResidentAssignmentsService, ResidentAssignmentsRepository],
})
export class ResidentAssignmentsModule {}
