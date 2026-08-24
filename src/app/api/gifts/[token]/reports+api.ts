import { requireAuthenticatedAccount } from "../../../../server/auth/session-auth";
import { getServerDatabase } from "../../../../server/db/client";
import { requireAlphaEmailAllowed, requireGiftSharingEnabled } from "../../../../server/gifts/alpha-safety";
import {
  GIFT_CONTENT_REPORT_REASONS,
  markGiftContentReportSupportNotified,
  reportGiftContent,
} from "../../../../server/gifts/content-safety";
import { sendGiftContentReportSupportEmailFromEnvironment } from "../../../../server/gifts/resend-email-sender";
import { ApiError, errorResponse } from "../../../../server/http/errors";
import { scheduleOpportunisticGiftMaintenance } from "../../../../server/maintenance/opportunistic-gift-maintenance";

export async function POST(request: Request, { token: giftId }: { token: string }): Promise<Response> {
  try {
    requireGiftSharingEnabled();
    const db = getServerDatabase();
    const account = await requireAuthenticatedAccount(request, db);
    requireAlphaEmailAllowed(account.email);
    const parsedBody: unknown = await request.json().catch(() => {
      throw new ApiError(400, "validation_failed", "Request body must be valid JSON");
    });
    if (typeof parsedBody !== "object" || parsedBody === null || Array.isArray(parsedBody)) {
      throw new ApiError(400, "validation_failed", "Request body must be an object");
    }
    const body = parsedBody as { reason?: unknown; details?: unknown };
    if (typeof body.reason !== "string" || !GIFT_CONTENT_REPORT_REASONS.includes(body.reason as never)) {
      throw new ApiError(400, "validation_failed", "A supported report reason is required");
    }
    if (body.details !== undefined && (typeof body.details !== "string" || body.details.length > 500)) {
      throw new ApiError(400, "validation_failed", "Report details must be at most 500 characters");
    }

    const result = await reportGiftContent(db, {
      giftId,
      reporterUserId: account.id,
      reporterEmail: account.email,
      reason: body.reason as (typeof GIFT_CONTENT_REPORT_REASONS)[number],
      details: body.details as string | undefined,
      now: new Date().toISOString(),
    });
    if (result.status === "forbidden") throw new ApiError(403, "gift_report_forbidden", "This account cannot report this gift");
    if (result.status === "no_snapshot") throw new ApiError(409, "gift_report_no_snapshot", "There is no published snapshot to report");

    if (!result.report.supportNotifiedAt) {
      try {
        await sendGiftContentReportSupportEmailFromEnvironment({
          reportId: result.report.id,
          giftId: result.report.giftId,
          snapshotVersion: result.report.snapshotVersion,
          reason: result.report.reason,
        });
        await markGiftContentReportSupportNotified(db, result.report.id, new Date().toISOString());
      } catch {
        // The report is already persisted and hidden. Scheduled maintenance retries the null marker.
        scheduleOpportunisticGiftMaintenance();
      }
    }

    return Response.json({
      status: result.status,
      report: { id: result.report.id, snapshotVersion: result.report.snapshotVersion },
    }, { status: result.status === "created" ? 201 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
