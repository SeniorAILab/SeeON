import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { join } from "node:path";

const SECRET_FD_ENV = "EDGE_PROVISIONING_SECRET_FD";
export const SECRET_SOCKET_ENV = "EDGE_PROVISIONING_SECRET_SOCKET";

export default async function setupSecretFdBridge(): Promise<() => Promise<void>> {
  const descriptor = parseDescriptor(process.env[SECRET_FD_ENV]);
  let secret = readFileSync(descriptor, "utf8").trim();
  if (secret.length === 0) throw new Error("Inherited secret descriptor is empty.");

  delete process.env[SECRET_FD_ENV];
  const socketPath = join(
    "/tmp",
    `ep-${process.pid}-${randomUUID().slice(0, 8)}.sock`,
  );
  const server = createServer((socket) => {
    const oneTimeSecret = secret;
    secret = "";
    socket.end(oneTimeSecret);
    server.close();
  });

  await listen(server, socketPath);
  process.env[SECRET_SOCKET_ENV] = socketPath;

  return async () => {
    delete process.env[SECRET_SOCKET_ENV];
    secret = "";
    await close(server);
    await rm(socketPath, { force: true });
  };
}

function parseDescriptor(value: string | undefined): number {
  const descriptor = Number(value);
  const isReadableDescriptor = descriptor === 0 || descriptor >= 3;
  if (!Number.isInteger(descriptor) || !isReadableDescriptor) {
    throw new Error(`${SECRET_FD_ENV} must name an inherited descriptor.`);
  }
  return descriptor;
}

function listen(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
}

function close(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
