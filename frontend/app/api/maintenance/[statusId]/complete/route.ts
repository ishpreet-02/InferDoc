import { prisma } from "@/app/lib/prisma";
import { getDemoUser } from "@/app/lib/user";
import { apiError } from "@/app/lib/errors";

export const runtime = "nodejs";

const DAY_MS = 86_400_000;

/**
 * POST /api/maintenance/[statusId]/complete — mark a maintenance task done.
 * Sets lastDoneAt = now, rolls nextDueAt forward by the task's intervalDays, and
 * flips status to DONE. The /my-products pages recompute OVERDUE/DUE_SOON/OK
 * from the new nextDueAt (see app/lib/maintenance.ts).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ statusId: string }> },
) {
  try {
    const { statusId } = await params;
    const user = await getDemoUser();

    const status = await prisma.userMaintenanceStatus.findUnique({
      where: { id: statusId },
      include: { task: true },
    });
    if (!status || status.userId !== user.id) {
      return Response.json(
        { ok: false, error: "maintenance status not found" },
        { status: 404 },
      );
    }

    const now = new Date();
    const nextDueAt = new Date(now.getTime() + status.task.intervalDays * DAY_MS);

    const updated = await prisma.userMaintenanceStatus.update({
      where: { id: statusId },
      data: { lastDoneAt: now, nextDueAt, status: "DONE" },
    });

    return Response.json({
      ok: true,
      status: {
        id: updated.id,
        lastDoneAt: updated.lastDoneAt,
        nextDueAt: updated.nextDueAt,
        status: updated.status,
      },
    });
  } catch (err) {
    return apiError("maintenance/complete", err);
  }
}
