# Course Platform

The vocabulary for how learners buy courses and ask for their money back. It exists so the app screens and the emails say the same thing.

## Refunds

**Refund request**:
A learner's ask to get their money back for a purchase. It stays open until the team approves or declines it, and the learner cannot withdraw it. A declined request can be followed by a new one inside the refund window, and each request is its own record.
_Avoid_: Cancellation, cancel my purchase, reversal, chargeback

**Refund**:
Money returned to the learner for a purchase, once a refund request is approved. A declined request is never a refund. A refund is always for the full amount the learner paid, never part of it.
_Avoid_: Reversal, chargeback, cancellation, partial refund

**Refund amount**:
The amount the learner actually paid for the purchase. It is what a refund returns, not the list price of the course.
_Avoid_: List price, course price

**Refund window**:
The period after a purchase during which a learner can make a refund request. It is checked only when the request is made, not when the team decides it.
_Avoid_: Refund period, cancellation window

**Watch limit**:
The total video reached on a course, above which a learner cannot make a refund request. It is checked only when the request is made.
_Avoid_: Viewing cap, watch allowance, watch time

**Refund decision**:
The team's approval or decline of an open refund request. Only a platform admin can make one, and a team admin cannot.
_Avoid_: Ruling, verdict, resolution

## People

**Platform admin**:
A user with the admin role on the platform. Platform admins decide refund requests and manage the whole platform.
_Avoid_: Admin (on its own), superuser

**Team admin**:
A member of a team who manages that team's seats. Team admins have no say over refund requests.
_Avoid_: Admin (on its own), team owner

## Refund statuses

The labels a learner sees for each state of a refund request.

**Refund requested**:
A refund request that is still open.
_Avoid_: Pending chargeback, pending reversal

**Refunded**:
A refund request that has been approved. Card settlement timing is not part of this term.
_Avoid_: Reversed, returned

**Refund declined**:
A refund request the team has turned down.
_Avoid_: Rejected, cancelled

## Enrollment and progress

**Enrollment**:
The record that a learner is taking a course. Removing it ends their ability to read the course's lessons.
_Avoid_: Purchase (an enrollment is not a purchase), subscription, membership

**Video reached**:
The furthest point a learner has reached in a lesson's video, summed across the course's lessons. Skipping ahead counts; time spent playing does not.
_Avoid_: Watched, watch time

**Progress**:
What a learner has done on a course: lessons completed out of the course's current total, and total video reached. Progress is kept after the enrollment is removed, so it can be shown to the team when they decide a refund request.
_Avoid_: Completion (as a synonym for everything), score

**Course completed**:
A state, not a count: every lesson in the course's current total is completed. It is recorded on the enrollment and is separate from progress.
_Avoid_: Finished (as a synonym), passed

## Out of scope

**Chargeback**:
A card dispute raised by the cardholder through their bank. The platform does not model these, so the word is kept out of learner-facing copy.
