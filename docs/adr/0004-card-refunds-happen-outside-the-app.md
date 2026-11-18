# Card refunds happen outside the app

The app records refund decisions but does not move money. There is no payment integration, so an approved refund is paid back to the learner's card by hand, outside the app. We chose this over integrating a payment provider now, because card settlement is a separate problem that the refund rules do not depend on.

Consequence: "Refunded" in the app means the request was approved, not that the money has landed.
