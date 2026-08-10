import type { Role } from "@/types";
import { ApiError, requestResponse } from "@/services/apiClient";

export type AlertMediaDownloadRequest = {
  readonly alertId: string;
  readonly signal?: AbortSignal;
};

type AlertMediaAttachmentBase = {
  readonly content: Blob;
  readonly filename: string;
  readonly contentType: "video/mp4";
  readonly byteLength: number;
};

export type FullAlertMediaAttachment = AlertMediaAttachmentBase & {
  readonly kind: "full";
};

export type PartialAlertMediaAttachment = AlertMediaAttachmentBase & {
  readonly kind: "partial";
  readonly range: {
    readonly start: number;
    readonly end: number;
    readonly total: number;
  };
};

export type AlertMediaAttachment =
  | FullAlertMediaAttachment
  | PartialAlertMediaAttachment;

export type AlertMediaDownloadErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "UNAVAILABLE"
  | "RANGE_NOT_SATISFIABLE"
  | "UNEXPECTED";

export class AlertMediaDownloadError extends Error {
  readonly name = "AlertMediaDownloadError";

  constructor(
    readonly status: number,
    readonly code: AlertMediaDownloadErrorCode,
  ) {
    super("Alert media attachment download failed.");
  }
}

export async function downloadAlertMediaAttachment(
  request: AlertMediaDownloadRequest,
): Promise<AlertMediaAttachment> {
  const options: RequestInit = { method: "GET" };
  if (request.signal !== undefined) options.signal = request.signal;
  try {
    const response = await requestResponse(
      `/alerts/${encodeURIComponent(request.alertId)}/media/download`,
      options,
    );
    const metadata = readAttachmentMetadata(response);
    const content = await response.blob();
    if (content.size !== metadata.byteLength) {
      throw new AlertMediaDownloadError(response.status, "UNEXPECTED");
    }
    switch (response.status) {
      case 200:
        return {
          kind: "full",
          content,
          filename: metadata.filename,
          contentType: "video/mp4",
          byteLength: metadata.byteLength,
        };
      case 206:
        return {
          kind: "partial",
          content,
          filename: metadata.filename,
          contentType: "video/mp4",
          byteLength: metadata.byteLength,
          range: readContentRange(response, metadata.byteLength),
        };
      default:
        throw new AlertMediaDownloadError(response.status, "UNEXPECTED");
    }
  } catch (error) {
    if (error instanceof AlertMediaDownloadError) throw error;
    if (error instanceof ApiError) {
      throw new AlertMediaDownloadError(
        error.status,
        downloadErrorCode(error.status),
      );
    }
    throw error;
  }
}

export function canDownloadAlertAttachment(role: Role | null): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

function readAttachmentMetadata(response: Response): {
  readonly filename: string;
  readonly byteLength: number;
} {
  const contentType = response.headers.get("Content-Type");
  const cacheControl = response.headers.get("Cache-Control");
  const acceptRanges = response.headers.get("Accept-Ranges");
  const entityTag = response.headers.get("ETag");
  const disposition = response.headers.get("Content-Disposition");
  if (
    contentType !== "video/mp4" ||
    cacheControl !== "private, no-store, no-transform" ||
    acceptRanges !== "bytes" ||
    entityTag === null ||
    !/^"sha256-[a-f0-9]{64}"$/.test(entityTag) ||
    disposition === null
  ) {
    throw new AlertMediaDownloadError(response.status, "UNEXPECTED");
  }
  const match =
    /^attachment; filename="([A-Za-z0-9][A-Za-z0-9._-]{0,127}\.mp4)"$/.exec(
      disposition,
    );
  if (match === null || match[1].includes("..")) {
    throw new AlertMediaDownloadError(response.status, "UNEXPECTED");
  }
  return {
    filename: match[1],
    byteLength: readContentLength(response),
  };
}

function readContentLength(response: Response): number {
  const value = response.headers.get("Content-Length");
  if (value === null || !/^\d+$/.test(value)) {
    throw new AlertMediaDownloadError(response.status, "UNEXPECTED");
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new AlertMediaDownloadError(response.status, "UNEXPECTED");
  }
  return length;
}

function readContentRange(
  response: Response,
  byteLength: number,
): PartialAlertMediaAttachment["range"] {
  if (byteLength < 1) {
    throw new AlertMediaDownloadError(response.status, "UNEXPECTED");
  }
  const value = response.headers.get("Content-Range");
  const match =
    value === null ? null : /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value);
  if (match === null) {
    throw new AlertMediaDownloadError(response.status, "UNEXPECTED");
  }
  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !Number.isSafeInteger(total) ||
    start > end ||
    end >= total ||
    end - start + 1 !== byteLength
  ) {
    throw new AlertMediaDownloadError(response.status, "UNEXPECTED");
  }
  return { start, end, total };
}

function downloadErrorCode(status: number): AlertMediaDownloadErrorCode {
  switch (status) {
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
    case 410:
      return "UNAVAILABLE";
    case 416:
      return "RANGE_NOT_SATISFIABLE";
    default:
      return "UNEXPECTED";
  }
}
