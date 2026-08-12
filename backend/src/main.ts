import { RequestMethod, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  if (process.env.FRONT_ORIGIN) {
    app.enableCors({ origin: process.env.FRONT_ORIGIN, credentials: true });
  }
  app.setGlobalPrefix('api', {
    exclude: [
      { path: '/', method: RequestMethod.ALL },
      { path: '/health', method: RequestMethod.ALL },
    ],
  });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  // whitelist/forbidNonWhitelisted intentionally left off: unknown body fields
  // stay tolerated, matching pre-migration manual-parsing behavior.
  app.useGlobalPipes(new ValidationPipe({ transform: true }));
  // ponytail: routes/methods auto-discovered from controllers; no per-route decorators.
  // Add @ApiProperty on a DTO only when its request/response shape needs to show in the schema.
  const config = new DocumentBuilder()
    .setTitle('Eldercare backend API')
    .setDescription(
      'Host API for facility operators (browser session cookie) and edge ML ingest (bearer token).',
    )
    .addCookieAuth('app_session')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'edge-bearer',
    )
    .addTag('Browser-session')
    .addTag('Edge-ingest')
    .addTag('Admin')
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, config),
  );
  await app.listen(process.env.PORT ?? 8080);
}
bootstrap().catch((error: unknown) => {
  console.error('Bootstrap failed', error);
  process.exit(1);
});
