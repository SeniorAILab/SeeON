import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ResidentsController } from './residents.controller.js';
import { ResidentsService } from './residents.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ResidentsController],
  providers: [ResidentsService],
})
export class ResidentsModule {}
