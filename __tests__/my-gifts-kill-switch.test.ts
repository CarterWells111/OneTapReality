jest.mock("../src/server/db/client", () => ({ getServerDatabase: jest.fn(() => ({})) }));
jest.mock("../src/server/gifts/r2-media", () => ({
  getR2MediaStoreFromEnvironment: jest.fn(() => ({
    createUploadUrl: jest.fn(async () => "https://example.invalid/upload"),
    getObjectMetadata: jest.fn(async () => null),
  })),
}));
jest.mock("../src/server/maintenance/opportunistic-gift-maintenance", () => ({ scheduleOpportunisticGiftMaintenance: jest.fn() }));

import { POST as publishGift, PUT as completeGiftPublish } from "../src/app/api/my-gifts/[id]/publish+api";
import { GET as readManagedGift } from "../src/app/api/my-gifts/[id]/manage+api";
import { GET as listMembers, POST as inviteMember, DELETE as removeMember } from "../src/app/api/my-gifts/[id]/members+api";
import { POST as disableOwnedGift } from "../src/app/api/my-gifts/[id]/disable+api";

const giftId = "gift-1";

function jsonRequest(body: unknown = {}) {
  return new Request("http://localhost/api/my-gifts/gift-1", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function expectSharingPaused(response: Response) {
  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual(
    expect.objectContaining({ error: expect.objectContaining({ code: "gift_sharing_paused" }) }),
  );
}

describe("account-authenticated gift routes honour the incident kill switch", () => {
  beforeEach(() => {
    process.env.GIFT_SHARING_ENABLED = "false";
  });

  afterEach(() => {
    delete process.env.GIFT_SHARING_ENABLED;
  });

  it("pauses publishing a shared album", async () => {
    await expectSharingPaused(await publishGift(jsonRequest({ sourceMemoryId: "memory-1", title: "旅行册" }), { id: giftId }));
    await expectSharingPaused(await completeGiftPublish(jsonRequest({ publicationId: "publication-1" }), { id: giftId }));
  });

  it("pauses reading the managed gift snapshot", async () => {
    await expectSharingPaused(await readManagedGift(jsonRequest(), { id: giftId }));
  });

  it("pauses listing and changing the gift access list", async () => {
    await expectSharingPaused(await listMembers(jsonRequest(), { id: giftId }));
    await expectSharingPaused(await inviteMember(jsonRequest({ email: "viewer@example.com" }), { id: giftId }));
    await expectSharingPaused(await removeMember(jsonRequest({ email: "viewer@example.com" }), { id: giftId }));
  });

  it("keeps the owner disable route available so a paused gift can still be shut down", async () => {
    const response = await disableOwnedGift(jsonRequest(), { id: giftId });

    expect(response.status).not.toBe(503);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ error: expect.objectContaining({ code: "unauthorized" }) }),
    );
  });
});
