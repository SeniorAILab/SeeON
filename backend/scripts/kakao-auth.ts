import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { request } from 'node:https';
import { dirname, resolve } from 'node:path';

const DEFAULT_ENV_PATH = resolve(process.cwd(), '../.env.local');
const DEFAULT_REDIRECT_URI = 'http://localhost:8080/auth/kakao/callback';
const KAKAO_AUTHORIZE_URL = 'https://kauth.kakao.com/oauth/authorize';
const KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
const REQUEST_TIMEOUT_MS = 10_000;

type Command =
  | { readonly kind: 'authorize'; readonly open: boolean }
  | { readonly kind: 'exchange'; readonly code: string };

type KakaoOAuthClient = {
  readonly restApiKey: string;
  readonly redirectUri: string;
  readonly clientSecret?: string;
  readonly tokenPath: string;
};

type KakaoTokenResponse = {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_in: number;
  readonly refresh_token_expires_in: number;
};

type KakaoTokenFile = {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_at: string;
  readonly refresh_expires_at: string;
};

type RedactedKakaoTokenSummary = {
  readonly token_path: string;
  readonly access_token_present: boolean;
  readonly refresh_token_present: boolean;
  readonly expires_at: string;
  readonly refresh_expires_at: string;
};

class CliInputError extends Error {}

class KakaoTokenParseError extends Error {
  constructor(readonly field: string) {
    super(`Invalid Kakao token response field: ${field}`);
  }
}

class KakaoHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly responseBody: string,
  ) {
    super(
      `Kakao token request failed with HTTP ${statusCode}: ${responseBody}`,
    );
  }
}

class KakaoRequestTimeoutError extends Error {
  constructor() {
    super('Kakao token request timed out');
  }
}

async function main(): Promise<void> {
  const envFile = await readEnvFile(DEFAULT_ENV_PATH);
  const config = loadConfig(envFile);
  const command = parseCommand(process.argv.slice(2));

  switch (command.kind) {
    case 'authorize': {
      const state = randomUUID();
      const authorizeUrl = buildAuthorizeUrl(config, state);
      if (command.open) {
        await openInBrowser(authorizeUrl);
        console.log('Kakao authorization URL opened in your browser.');
      } else {
        console.log('Kakao authorization URL prepared.');
      }
      console.log(authorizeUrl);
      console.log('Client ID: [redacted]');
      console.log(`Redirect URI: ${config.redirectUri}`);
      console.log(`Token output path: ${config.tokenPath}`);
      console.log(
        'After login, copy the code query parameter from the redirected URL.',
      );
      console.log('Then run: pnpm kakao:auth exchange --code <code>');
      return;
    }
    case 'exchange': {
      const token = await exchangeAuthorizationCode(config, command.code);
      await writeTokenFile(config.tokenPath, token);
      console.log(
        JSON.stringify(redactedTokenSummary(config.tokenPath, token), null, 2),
      );
      return;
    }
  }
}

async function readEnvFile(path: string): Promise<Record<string, string>> {
  try {
    const text = await readFile(path, 'utf8');
    const envFile: Record<string, string> = {};
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith('#')) {
        continue;
      }
      const eqIndex = line.indexOf('=');
      if (eqIndex < 1) {
        continue;
      }
      const key = line.slice(0, eqIndex).trim();
      if (key.length === 0) {
        continue;
      }
      const rawValue = line.slice(eqIndex + 1).trim();
      envFile[key] = stripEnvQuotes(rawValue);
    }
    return envFile;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

function loadConfig(envFile: Record<string, string>): KakaoOAuthClient {
  const restApiKey = readEnv('KAKAO_REST_API_KEY', envFile);
  const redirectUri =
    readEnv('KAKAO_REDIRECT_URI', envFile) ?? DEFAULT_REDIRECT_URI;
  const clientSecret = readEnv('KAKAO_CLIENT_SECRET', envFile);
  const tokenPath = readEnv('KAKAO_TOKEN_PATH', envFile);

  if (restApiKey === undefined) {
    throw new CliInputError(
      'Missing KAKAO_REST_API_KEY. Add it to repo root .env.local or export it.',
    );
  }
  if (tokenPath === undefined) {
    throw new CliInputError(
      'Missing KAKAO_TOKEN_PATH. Add it to repo root .env.local or export it.',
    );
  }

  return {
    restApiKey,
    redirectUri,
    clientSecret,
    tokenPath: resolve(tokenPath),
  };
}

function readEnv(
  name: string,
  envFile: Record<string, string>,
): string | undefined {
  const value = process.env[name] ?? envFile[name];
  if (value === undefined || value.length === 0) {
    return undefined;
  }
  return value;
}

function parseCommand(args: readonly string[]): Command {
  const [command, ...rest] = args;
  if (command === 'authorize') {
    return { kind: 'authorize', open: rest.includes('--open') };
  }
  if (command === 'exchange') {
    const code = readFlag(rest, '--code');
    if (code.length === 0) {
      throw new CliInputError('Missing --code for exchange command.');
    }
    return { kind: 'exchange', code };
  }
  throw new CliInputError(
    'Usage: pnpm kakao:auth authorize [--open] | pnpm kakao:auth exchange --code <code>',
  );
}

function readFlag(args: readonly string[], flag: string): string {
  const index = args.indexOf(flag);
  if (index < 0) {
    return '';
  }
  return args[index + 1] ?? '';
}

function buildAuthorizeUrl(config: KakaoOAuthClient, state: string): string {
  const url = new URL(KAKAO_AUTHORIZE_URL);
  url.searchParams.append('client_id', config.restApiKey);
  url.searchParams.append('redirect_uri', config.redirectUri);
  url.searchParams.append('response_type', 'code');
  url.searchParams.append('scope', 'talk_message');
  url.searchParams.append('state', state);
  return url.toString();
}

async function exchangeAuthorizationCode(
  config: KakaoOAuthClient,
  code: string,
): Promise<KakaoTokenFile> {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.restApiKey,
    redirect_uri: config.redirectUri,
    code,
  });
  if (config.clientSecret !== undefined) {
    form.append('client_secret', config.clientSecret);
  }

  const response = await postForm(new URL(KAKAO_TOKEN_URL), form);
  return parseKakaoTokenResponse(response, new Date());
}

function parseKakaoTokenResponse(input: unknown, now: Date): KakaoTokenFile {
  const response = parseKakaoTokenResponseDto(input);
  return {
    access_token: response.access_token,
    refresh_token: response.refresh_token,
    expires_at: toIsoAfterSeconds(now, response.expires_in),
    refresh_expires_at: toIsoAfterSeconds(
      now,
      response.refresh_token_expires_in,
    ),
  };
}

function parseKakaoTokenResponseDto(input: unknown): KakaoTokenResponse {
  const body = parseObject(input);
  return {
    access_token: readString(body, 'access_token'),
    refresh_token: readString(body, 'refresh_token'),
    expires_in: readPositiveSeconds(body, 'expires_in'),
    refresh_token_expires_in: readPositiveSeconds(
      body,
      'refresh_token_expires_in',
    ),
  };
}

function parseObject(input: unknown): object {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new KakaoTokenParseError('body');
  }
  return input;
}

function readString(body: object, field: string): string {
  const value: unknown = Reflect.get(body, field);
  if (typeof value !== 'string' || value.length === 0) {
    throw new KakaoTokenParseError(field);
  }
  return value;
}

function readPositiveSeconds(body: object, field: string): number {
  const value: unknown = Reflect.get(body, field);
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new KakaoTokenParseError(field);
  }
  return value;
}

function toIsoAfterSeconds(now: Date, seconds: number): string {
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

async function postForm(url: URL, form: URLSearchParams): Promise<unknown> {
  const body = form.toString();
  const responseBody = await new Promise<string>(
    (resolvePromise, rejectPromise) => {
      const req = request(
        url,
        {
          method: 'POST',
          timeout: REQUEST_TIMEOUT_MS,
          headers: {
            Accept: 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const responseText = Buffer.concat(chunks).toString('utf8');
            const statusCode = res.statusCode ?? 0;
            if (statusCode < 200 || statusCode >= 300) {
              rejectPromise(new KakaoHttpError(statusCode, responseText));
              return;
            }
            resolvePromise(responseText);
          });
        },
      );
      req.on('timeout', () => req.destroy(new KakaoRequestTimeoutError()));
      req.on('error', rejectPromise);
      req.end(body);
    },
  );

  try {
    const parsed: unknown = JSON.parse(responseBody);
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new KakaoTokenParseError('json');
    }
    throw error;
  }
}

async function writeTokenFile(
  path: string,
  token: KakaoTokenFile,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(token, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(tmpPath, path);
}

function redactedTokenSummary(
  tokenPath: string,
  token: KakaoTokenFile,
): RedactedKakaoTokenSummary {
  return {
    token_path: tokenPath,
    access_token_present: token.access_token.length > 0,
    refresh_token_present: token.refresh_token.length > 0,
    expires_at: token.expires_at,
    refresh_expires_at: token.refresh_expires_at,
  };
}

async function openInBrowser(url: string): Promise<void> {
  const command = browserOpenCommand(url);
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command.executable, command.args, {
      stdio: 'ignore',
      detached: false,
    });
    child.on('error', () => {
      rejectPromise(
        new CliInputError(
          'Failed to open Kakao authorization URL in the browser.',
        ),
      );
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new CliInputError(
          'Failed to open Kakao authorization URL in the browser.',
        ),
      );
    });
  });
}

function browserOpenCommand(url: string): {
  readonly executable: string;
  readonly args: readonly string[];
} {
  if (process.platform === 'darwin') {
    return { executable: 'open', args: [url] };
  }
  if (process.platform === 'win32') {
    return { executable: 'cmd', args: ['/c', 'start', '', url] };
  }
  return { executable: 'xdg-open', args: [url] };
}

function stripEnvQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

main().catch((error: unknown) => {
  if (error instanceof CliInputError) {
    console.error(error.message);
    process.exit(2);
  }
  if (error instanceof Error) {
    console.error(error.message);
    process.exit(1);
  }
  console.error('Unknown failure');
  process.exit(1);
});
