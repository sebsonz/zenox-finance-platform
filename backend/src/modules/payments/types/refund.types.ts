export type RefundStatus = "REQUESTED" | "APPROVED" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export interface RefundRecord {
  id: string;
  paymentId: string;
  amount: string;
  currencyCode: string;
  status: RefundStatus;
  reason: string;
  externalReference: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
