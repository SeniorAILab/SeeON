import { describe, expect, it } from "vitest";

import {
  EdgeEnrollmentResponseError,
  parseTopologyPreviewStatus,
} from "./edgeEnrollments";

const BASE_RESPONSE = {
  schemaVersion: 1,
  snapshotId: "0197f671-3a31-7a6c-a6e4-83ed412de81a",
  clientRevision: 1,
  serverRevision: 2,
  result: {
    floors: { created: 0, updated: 1, unchanged: 2, reactivated: 1 },
    rooms: { created: 1, updated: 0, unchanged: 2, deactivated: 1 },
    cameras: {
      created: 1,
      updated: 1,
      unchanged: 0,
      reactivated: 1,
      deactivated: 1,
    },
  },
  omissions: null,
} as const;

const TRANSFER_PREVIEW = {
  manifestDigest: "b".repeat(64),
  items: [
    {
      kind: "ROOM",
      edgeRef: "room-201",
      canonicalId: "a2222222-2222-4222-8222-222222222222",
      parentCanonicalId: "f1111111-1111-4111-8111-111111111111",
    },
  ],
} as const;

describe("topology preview optional canonical fields", () => {
  it.each([
    ["absent", BASE_RESPONSE, null],
    ["null", { ...BASE_RESPONSE, ownershipTransferRequired: null }, null],
    [
      "preview",
      { ...BASE_RESPONSE, ownershipTransferRequired: TRANSFER_PREVIEW },
      TRANSFER_PREVIEW,
    ],
  ])(
    "accepts ownershipTransferRequired when %s",
    (_name, response, expected) => {
      expect(parseTopologyPreviewStatus(response)).toMatchObject({
        kind: "clear",
        ownershipTransferRequired: expected,
      });
    },
  );

  it("accepts optional nonnegative reactivated and deactivated mutation counts", () => {
    expect(parseTopologyPreviewStatus(BASE_RESPONSE)).toMatchObject({
      kind: "clear",
    });
  });

  it("rejects uppercase canonical UUIDs", () => {
    const response = {
      ...BASE_RESPONSE,
      ownershipTransferRequired: {
        ...TRANSFER_PREVIEW,
        items: [
          {
            ...TRANSFER_PREVIEW.items[0],
            canonicalId: "A2222222-2222-4222-8222-222222222222",
          },
        ],
      },
    };

    expect(() => parseTopologyPreviewStatus(response)).toThrow(
      EdgeEnrollmentResponseError,
    );
  });

  it.each([
    {
      ...BASE_RESPONSE,
      ownershipTransferRequired: {
        ...TRANSFER_PREVIEW,
        items: [{ ...TRANSFER_PREVIEW.items[0], kind: "UNKNOWN" }],
      },
    },
    {
      ...BASE_RESPONSE,
      ownershipTransferRequired: { ...TRANSFER_PREVIEW, secret: "unexpected" },
    },
    {
      ...BASE_RESPONSE,
      result: {
        ...BASE_RESPONSE.result,
        floors: { ...BASE_RESPONSE.result.floors, reactivated: -1 },
      },
    },
  ])("rejects malformed optional topology fields", (response) => {
    expect(() => parseTopologyPreviewStatus(response)).toThrow(
      EdgeEnrollmentResponseError,
    );
  });
});
