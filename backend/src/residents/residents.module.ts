import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ResidentsController } from './residents.controller.js';
import { ResidentsService } from './residents.service.js';
import { ResidentsRepository } from './residents.repository.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ResidentsController],
  providers: [ResidentsService, ResidentsRepository],
})
export class ResidentsModule {}
