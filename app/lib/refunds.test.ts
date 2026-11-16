import { describe, it, expect } from "vitest";
import { RefundStatus } from "~/db/schema";
import {
  blocksNewRefundRequest,
  canDecideRefund,
  statusAfterDecision,
} from "./refunds";

describe("canDecideRefund", () => {
  it("allows deciding an open request", () => {
    expect(canDecideRefund(RefundStatus.Requested)).toBe(true);
  });

  it("refuses to decide a request that was already decided", () => {
    expect(canDecideRefund(RefundStatus.Approved)).toBe(false);
    expect(canDecideRefund(RefundStatus.Declined)).toBe(false);
  });
});

describe("statusAfterDecision", () => {
  it("approve moves the request to approved", () => {
    expect(statusAfterDecision("approve")).toBe(RefundStatus.Approved);
  });

  it("decline moves the request to declined", () => {
    expect(statusAfterDecision("decline")).toBe(RefundStatus.Declined);
  });
});

describe("blocksNewRefundRequest", () => {
  it("blocks while a request is open", () => {
    expect(blocksNewRefundRequest([RefundStatus.Requested])).toBe(true);
  });

  it("blocks once a refund has been approved", () => {
    expect(blocksNewRefundRequest([RefundStatus.Approved])).toBe(true);
  });

  it("does not block after a decline", () => {
    expect(blocksNewRefundRequest([RefundStatus.Declined])).toBe(false);
  });

  it("does not block when there are no requests", () => {
    expect(blocksNewRefundRequest([])).toBe(false);
  });

  it("blocks when an earlier decline sits alongside an approval", () => {
    expect(
      blocksNewRefundRequest([RefundStatus.Declined, RefundStatus.Approved])
    ).toBe(true);
  });
});
