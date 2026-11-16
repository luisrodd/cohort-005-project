import { RefundStatus } from "~/db/schema";

export type RefundDecision = "approve" | "decline";

/** Only a request that is still open can be approved or declined. */
export function canDecideRefund(status: RefundStatus): boolean {
  return status === RefundStatus.Requested;
}

/** The status a decision moves a request to. */
export function statusAfterDecision(decision: RefundDecision): RefundStatus {
  return decision === "approve" ? RefundStatus.Approved : RefundStatus.Declined;
}

/**
 * A learner may ask for a refund only when no request is open and nothing has
 * been refunded on this purchase. A declined request does not block a new one.
 */
export function blocksNewRefundRequest(statuses: RefundStatus[]): boolean {
  return statuses.some(
    (status) =>
      status === RefundStatus.Requested || status === RefundStatus.Approved
  );
}
