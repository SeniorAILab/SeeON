import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readPositiveIntegerConfig } from './config';

import type {
  PredictFallRequestDto,
  PredictFallResponseDto,
} from '../dto/alert-events.dto';
import type { PredictionPort } from '../ports/prediction.port';

const DEFAULT_TIMEOUT_MS = 3_000;

@Injectable()
export class MlServingPredictionAdapter implements PredictionPort {
  constructor(private readonly configService: ConfigService) {}

  async predict(
    request: PredictFallRequestDto,
  ): Promise<PredictFallResponseDto> {
    const response = await postJson(this.predictEndpoint(), request, {
      timeoutMs: this.timeoutMs(),
    });
    return parsePredictFallResponse(response);
  }

  private predictEndpoint(): URL {
    const baseUrl = this.configService.get<string>('ML_SERVING_URL');
    if (baseUrl === undefined || baseUrl.length === 0) {
      throw new MlServingConfigError('ML_SERVING_URL');
    }
    return new URL('/predict', baseUrl);
  }

  private timeoutMs(): number {
    return readPositiveIntegerConfig(
      this.configService,
      'ML_SERVING_TIMEOUT_MS',
      DEFAULT_TIMEOUT_MS,
    );
  }
}

export class MlServingConfigError extends Error {
  constructor(readonly configName: string) {
    super(`ML serving config is missing: ${configName}`);
  }
}

export class MlServingHttpError extends Error {
  constructor(readonly statusCode: number) {
    super(`ML serving /predict failed with HTTP ${statusCode}`);
  }
}

export class MlServingTimeoutError extends Error {
  constructor() {
    super('ML serving /predict request timed out');
  }
}

export class MlServingResponseError extends Error {
  constructor(readonly field: string) {
    super(`ML serving /predict response is invalid: ${field}`);
  }
}

async function postJson(
  url: URL,
  payload: PredictFallRequestDto,
  options: { readonly timeoutMs: number },
): Promise<string> {
  const body = JSON.stringify(payload);
  return new Promise<string>((resolve, reject) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(
      url,
      {
        method: 'POST',
        timeout: options.timeoutMs,
        headers: {
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const statusCode = res.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            reject(new MlServingHttpError(statusCode));
            return;
          }
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
      },
    );
    req.on('timeout', () => req.destroy(new MlServingTimeoutError()));
    req.on('error', reject);
    req.end(body);
  });
}

function parsePredictFallResponse(input: string): PredictFallResponseDto {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new MlServingResponseError('json');
  }

  if (!isJsonRecord(parsed)) {
    throw new MlServingResponseError('body');
  }

  const fallProbability = readFiniteNumber(parsed, 'fall_probability');
  const operatingThreshold = readFiniteNumber(parsed, 'operating_threshold');
  const isFall = Reflect.get(parsed, 'is_fall');
  if (typeof isFall !== 'boolean') {
    throw new MlServingResponseError('is_fall');
  }

  return {
    fall_probability: fallProbability,
    operating_threshold: operatingThreshold,
    is_fall: isFall,
  };
}

function readFiniteNumber(body: object, field: string): number {
  const value: unknown = Reflect.get(body, field);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MlServingResponseError(field);
  }
  return value;
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
