import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.video-tracking";
import { getCurrentUserId } from "~/lib/session";
import { parseJsonBody } from "~/lib/validation";
import { db } from "~/db";
import { lessons, modules, videoWatchEvents } from "~/db/schema";
import { eq } from "drizzle-orm";
import { getAccess } from "~/lib/access.server";

const videoTrackingSchema = z.object({
  lessonId: z.number(),
  eventType: z.string(),
  positionSeconds: z.number(),
});

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  const parsed = await parseJsonBody(request, videoTrackingSchema);

  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const { lessonId, eventType, positionSeconds } = parsed.data;

  const lesson = db
    .select({ courseId: modules.courseId })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(lessons.id, lessonId))
    .get();

  if (!lesson) {
    throw data("Lesson not found", { status: 404 });
  }

  // Video reached only counts while the learner has access. Once an enrollment
  // is gone, progress stops growing but the history stays.
  const access = await getAccess(request, lesson.courseId);
  if (!access.canViewContent) {
    throw data("You must be enrolled in this course.", { status: 403 });
  }

  db
    .insert(videoWatchEvents)
    .values({
      userId: currentUserId,
      lessonId,
      eventType,
      positionSeconds,
    })
    .returning()
    .get();

  return { success: true };
}
