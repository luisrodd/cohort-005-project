import { useFetcher, data, isRouteErrorResponse, Link } from "react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { Route } from "./+types/admin.refunds";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { formatPrice } from "~/lib/utils";
import {
  canDecideRefund,
  statusAfterDecision,
  type RefundDecision,
} from "~/lib/refunds";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { AlertTriangle } from "lucide-react";
import { db } from "~/db";
import {
  UserRole,
  RefundStatus,
  courses,
  enrollments,
  purchases,
  refunds,
  users,
} from "~/db/schema";

const refundDecisionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("approve"),
    refundId: z.coerce.number().int(),
  }),
  z.object({
    intent: z.literal("decline"),
    refundId: z.coerce.number().int(),
    note: z
      .string()
      .trim()
      .min(10, "Tell the learner a little more about the decision.")
      .max(1000, "Please keep the note under 1000 characters."),
  }),
]);

const refundStatusLabels: Record<RefundStatus, string> = {
  [RefundStatus.Requested]: "Refund requested",
  [RefundStatus.Approved]: "Refunded",
  [RefundStatus.Declined]: "Refund declined",
};

const refundStatusClasses: Record<RefundStatus, string> = {
  [RefundStatus.Requested]:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  [RefundStatus.Approved]:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  [RefundStatus.Declined]: "bg-muted text-muted-foreground",
};

/** Admins only. Instructors do not decide refunds, even for their own courses. */
function requireAdmin(userId: number | null) {
  if (!userId) {
    throw data("Select a user from the DevUI panel to manage refunds.", {
      status: 401,
    });
  }

  const user = db.select().from(users).where(eq(users.id, userId)).get();

  if (!user || user.role !== UserRole.Admin) {
    throw data("Only admins can manage refunds.", { status: 403 });
  }

  return user;
}

/**
 * The confirmation the learner gets in their inbox. There is no mail
 * transport wired up yet, so the built message goes to the server log.
 */
function buildDecisionEmail(input: {
  learnerName: string;
  learnerEmail: string;
  courseTitle: string;
  amount: number;
  decision: RefundDecision;
  note: string | null;
}) {
  if (input.decision === "approve") {
    return {
      to: input.learnerEmail,
      subject: `Refund approved — ${input.courseTitle}`,
      body: [
        `Hi ${input.learnerName},`,
        "",
        `We have approved your refund request for "${input.courseTitle}".`,
        `Your refund of ${formatPrice(input.amount)}, the amount you paid, will go back to the card you paid with.`,
        "",
        "You no longer have access to this course.",
        "",
        "— The Cadence team",
      ].join("\n"),
    };
  }

  return {
    to: input.learnerEmail,
    subject: `Refund declined — ${input.courseTitle}`,
    body: [
      `Hi ${input.learnerName},`,
      "",
      `We have declined your refund request for "${input.courseTitle}".`,
      "",
      "Our note:",
      input.note ?? "",
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

export function meta() {
  return [
    { title: "Refund requests — Cadence" },
    { name: "description", content: "Approve or decline refund requests" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  requireAdmin(await getCurrentUserId(request));

  const showAll = new URL(request.url).searchParams.get("status") === "all";

  const rows = db
    .select({
      id: refunds.id,
      status: refunds.status,
      reason: refunds.reason,
      decisionNote: refunds.decisionNote,
      requestedAt: refunds.requestedAt,
      courseTitle: courses.title,
      learnerName: users.name,
      learnerEmail: users.email,
      amountPaid: purchases.amountPaid,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .where(showAll ? undefined : eq(refunds.status, RefundStatus.Requested))
    .orderBy(desc(refunds.requestedAt))
    .all();

  return { refunds: rows, showAll };
}

export async function action({ request }: Route.ActionArgs) {
  const admin = requireAdmin(await getCurrentUserId(request));

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundDecisionSchema);

  if (!parsed.success) {
    return data(
      { error: Object.values(parsed.errors)[0] ?? "Invalid input." },
      { status: 400 }
    );
  }

  const input = parsed.data;

  const refund = db
    .select()
    .from(refunds)
    .where(eq(refunds.id, input.refundId))
    .get();

  if (!refund) {
    throw data("Refund request not found.", { status: 404 });
  }

  if (!canDecideRefund(refund.status)) {
    throw data("This request has already been decided.", { status: 409 });
  }

  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, refund.purchaseId))
    .get();
  const course = purchase
    ? db.select().from(courses).where(eq(courses.id, purchase.courseId)).get()
    : undefined;
  const learner = purchase
    ? db.select().from(users).where(eq(users.id, purchase.userId)).get()
    : undefined;

  if (!purchase || !course || !learner) {
    throw data("Refund request is missing its purchase.", { status: 500 });
  }

  const decision: RefundDecision = input.intent;
  const note = input.intent === "decline" ? input.note : null;

  // The status check in the WHERE clause is what stops two admins deciding the
  // same request: whoever loses the race updates no rows and is refused. The
  // whole decision commits or rolls back together, so an approval never leaves
  // the learner enrolled.
  db.transaction((tx) => {
    const updated = tx
      .update(refunds)
      .set({
        status: statusAfterDecision(decision),
        resolvedAt: new Date().toISOString(),
        resolvedByUserId: admin.id,
        amountRefunded: decision === "approve" ? purchase.amountPaid : null,
        decisionNote: note,
      })
      .where(
        and(
          eq(refunds.id, refund.id),
          eq(refunds.status, RefundStatus.Requested)
        )
      )
      .returning()
      .get();

    if (!updated) {
      throw data("This request has already been decided.", { status: 409 });
    }

    if (decision === "approve") {
      tx.delete(enrollments)
        .where(
          and(
            eq(enrollments.userId, purchase.userId),
            eq(enrollments.courseId, purchase.courseId)
          )
        )
        .run();
    }
  });

  const email = buildDecisionEmail({
    learnerName: learner.name,
    learnerEmail: learner.email,
    courseTitle: course.title,
    amount: purchase.amountPaid,
    decision,
    note,
  });

  console.log(
    `[email] to=${email.to} subject=${email.subject}\n${email.body}`
  );

  return { success: true };
}

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  const { refunds: rows, showAll } = loaderData;
  const fetcher = useFetcher<{ error?: string; success?: boolean }>();
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error) {
      toast.error(fetcher.data.error);
    }
    if (fetcher.state === "idle" && fetcher.data?.success) {
      toast.success("Decision saved.");
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Refund requests</h1>
        <p className="mt-1 text-muted-foreground">
          Approve or decline the requests learners have sent in.
        </p>
      </div>

      <nav className="mb-6 flex gap-4 text-sm">
        <Link
          to="/admin/refunds"
          className={!showAll ? "font-semibold" : "text-muted-foreground"}
        >
          Open
        </Link>
        <Link
          to="/admin/refunds?status=all"
          className={showAll ? "font-semibold" : "text-muted-foreground"}
        >
          All
        </Link>
      </nav>

      {rows.length === 0 && (
        <p className="text-muted-foreground">
          {showAll ? "No refund requests yet." : "No open refund requests."}
        </p>
      )}

      <div className="space-y-4">
        {rows.map((row) => (
          <Card key={row.id}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{row.courseTitle}</h2>
                  <p className="text-sm text-muted-foreground">
                    {row.learnerName} · {row.learnerEmail} ·{" "}
                    {formatPrice(row.amountPaid)} · requested{" "}
                    {new Date(row.requestedAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${refundStatusClasses[row.status]}`}
                >
                  {refundStatusLabels[row.status]}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">{row.reason}</p>

              {row.status === RefundStatus.Approved && (
                <p className="text-sm text-muted-foreground">
                  Approved. Refund {formatPrice(row.amountPaid)} to the
                  learner&apos;s card outside the app.
                </p>
              )}

              {row.status === RefundStatus.Declined && row.decisionNote && (
                <p className="text-sm text-muted-foreground">
                  Note sent to the learner: {row.decisionNote}
                </p>
              )}

              {row.status === RefundStatus.Requested && (
                <div className="grid gap-4 md:grid-cols-2">
                  <fetcher.Form method="post" className="space-y-2">
                    <input type="hidden" name="intent" value="approve" />
                    <input type="hidden" name="refundId" value={row.id} />
                    <p className="text-sm">
                      Approving removes the learner&apos;s access to the course.
                    </p>
                    <Button type="submit" disabled={isSubmitting}>
                      Approve
                    </Button>
                  </fetcher.Form>

                  <fetcher.Form method="post" className="space-y-2">
                    <input type="hidden" name="intent" value="decline" />
                    <input type="hidden" name="refundId" value={row.id} />
                    <Textarea
                      name="note"
                      rows={3}
                      required
                      placeholder="Why are you declining? The learner sees this."
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={isSubmitting}
                    >
                      Decline
                    </Button>
                  </fetcher.Form>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    if (error.status === 401) {
      title = "Sign in required";
      message =
        typeof error.data === "string"
          ? error.data
          : "Please select a user from the DevUI panel.";
    } else if (error.status === 403) {
      title = "Admins only";
      message =
        typeof error.data === "string" ? error.data : "Only admins can do that.";
    } else {
      title = `Error ${error.status}`;
      message =
        typeof error.data === "string" ? error.data : error.statusText;
    }
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/">
          <Button>Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
