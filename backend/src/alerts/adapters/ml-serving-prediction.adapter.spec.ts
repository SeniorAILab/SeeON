import { createServer, type Server, type IncomingMessage } from 'node:http';

import { ConfigService } from '@nestjs/config';

import {
  MlServingPredictionAdapter,
  MlServingResponseError,
} from './ml-serving-prediction.adapter';

describe('MlServingPredictionAdapter', () => {
  let server: Server;
  let receivedPath: string | undefined;
  let receivedBody: unknown;

  afterEach(async () => {
    if (server !== undefined) {
      await closeServer(server);
    }
  });

  it('posts the stable /predict request and parses the approved response shape', async () => {
    server = await startServer(async (req) => {
      receivedPath = req.url;
      receivedBody = JSON.parse(await readBody(req));
      return JSON.stringify({
        fall_probability: 0.91,
        operating_threshold: 0.8,
        is_fall: true,
      });
    });
    const adapter = new MlServingPredictionAdapter(
      configService({ ML_SERVING_URL: serverUrl(server) }),
    );
    const request = { window: [[0, 0, 0.9]] };

    await expect(adapter.predict(request)).resolves.toEqual({
      fall_probability: 0.91,
      operating_threshold: 0.8,
      is_fall: true,
    });
    expect(receivedPath).toBe('/predict');
    expect(receivedBody).toEqual(request);
  });

  it('rejects responses that drift from {fall_probability, operating_threshold, is_fall}', async () => {
    server = await startServer(() =>
      JSON.stringify({ fall_probability: 0.91, model: 'rf' }),
    );
    const adapter = new MlServingPredictionAdapter(
      configService({ ML_SERVING_URL: serverUrl(server) }),
    );

    await expect(adapter.predict({ window: [[0, 0, 0.9]] })).rejects.toThrow(
      MlServingResponseError,
    );
  });
});

function configService(
  values: Readonly<Record<string, string>>,
): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

async function startServer(
  handler: (req: IncomingMessage) => Promise<string> | string,
): Promise<Server> {
  const server = createServer((req, res) => {
    Promise.resolve(handler(req))
      .then((body) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(body);
      })
      .catch((error: unknown) => {
        res.statusCode = 500;
        res.end(String(error));
      });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return server;
}

function serverUrl(server: Server): string {
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('Expected TCP server address');
  }
  return `http://127.0.0.1:${address.port}`;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
