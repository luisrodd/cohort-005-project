# Web Push feasibility for Cadence

Access date for all sources: 2026-11-18. Claims marked UNVERIFIED could not be confirmed from a fetched primary source.

## 1. Question and short answer

Question: Cadence (React Router web app, no native app) wants push notifications as an out-of-app channel. How feasible is Web Push?

**Verdict: Web Push is feasible as an opt-in secondary channel, not as the default. Email should be the default out-of-app channel.** Push needs a browser permission that can be permanently blocked, cannot be requested on page load, does not work on iOS Safari outside an installed Home Screen web app, and its subscriptions expire silently. Email needs none of that.

## 2. Service worker and VAPID requirements

- **Secure context.** Service workers may only be registered in secure contexts; "Only secure contexts are allowed to register service workers" [9]. Secure means HTTPS or loopback/localhost [9][11]. PushManager is also `[SecureContext]` and `subscribe()` rejects non-https scopes [16].
- **Scope.** The default scope is the directory containing the script. A broader scope requires a `Service-Worker-Allowed` response header on the script [10][11]. Serve `sw.js` from the root.
- **Push handling.** Chrome requires a notification for every push: "You have to show a notification when you receive a push message" [13]. Chrome otherwise shows its own generic notification [13]. Chrome's `userVisibleOnly` must be `true`; Chrome and Edge reject the subscribe promise otherwise [12][5]. The W3C spec rejects with `NotAllowedError` when the user agent requires it and the flag is false [16].
- **notificationclick.** The sources fetched did not cover the `notificationclick` handler. UNVERIFIED for exact handler behaviour.
- **VAPID (RFC 8292).** The application server signs an ES256 JWT (ECDSA P-256) and sends it in `Authorization: vapid t=..., k=...` [1]. `k` is the uncompressed public key, base64url [1]. `exp` is mandatory and at most 24 hours ahead [1]. `sub` is optional, but SHOULD be a `mailto:` or `https:` contact URI [1]. The `applicationServerKey` passed to `subscribe()` is this public key, not the encryption key [12].
- **Push protocol (RFC 8030).** A TTL header is mandatory; omitting it gets a 400 [2]. Urgency values are very-low, low, normal (default), high [2].
- **Expiry.** For an expired subscription, the push service returns **404** [2]. A **410** is a different failure (undelivered message, retries stopped) and is not a subscription-expiry signal [2]. Browsers fire `pushsubscriptionchange` when a subscription can no longer be used [16]. Handle both 404 and 410 by deleting the stored subscription.
- **Payload encryption (RFC 8291).** Uses `aes128gcm` [3]. ECDH on P-256 per message [3]. A 16-byte per-subscription auth secret feeds HKDF [3]. Use a library (e.g. `web-push`) rather than hand-rolling this.

## 3. Browser support matrix

| Browser | Supported | Minimum version | Conditions | Source |
|---|---|---|---|---|
| Chrome desktop | Yes | Push API from Chrome 42; full implementation cited as Chrome 46 (article is flagged as old) | HTTPS; `userVisibleOnly: true`; show a notification per push; VAPID effectively needed | [13][12] |
| Chrome Android | Yes (via Chrome) | UNVERIFIED | Same as desktop; not separately fetched | UNVERIFIED |
| Firefox desktop | Yes | UNVERIFIED for push minimum | `subscribe()` must be gesture-triggered from Firefox 72; VAPID optional | [12] |
| Safari macOS | Yes | Safari 16 on macOS Ventura (WebKit cites 16.1) | Standards Web Push; permission managed per site in Notifications Center; detailed permission flow UNVERIFIED | [15][4] |
| iOS/iPadOS Safari, Home Screen web app | Yes, only when installed | iOS/iPadOS 16.4 | Must be added to Home Screen; permission request must follow direct user interaction; not available in Safari tabs | [4] |
| Edge | Yes (Chromium) | UNVERIFIED | `userVisibleOnly` required, as in Chrome | [12] |

Apple's developer documentation page could not be read (fetch returned only the title), so no Apple-published statement is cited for macOS or iOS.

## 4. Permission-prompt UX constraints

- **User gesture.** Request permission from a click handler. Browsers are moving to block non-gesture notification requests; Firefox does so from 72 [12]. Safari on iOS requires direct user interaction [4]. Treat a gesture as mandatory everywhere.
- **Denial is effectively permanent.** After Block, "your web app cannot ask the user for permission again"; reversing it requires the browser UI [6]. Do not show the native prompt until the user has seen a value explanation; use an in-app dialog first [6].
- **Chrome quieter prompts.** Chrome auto-routes sites with low accept rates to a quieter UI. Introduced in Chrome 80 per a search snippet; the source page was not fetched, so UNVERIFIED [22]. The exact threshold is UNVERIFIED.
- **Chrome rate limits (Jan 2026).** Sites with high push volume and low engagement are capped at no less than 1000 requests per minute, with HTTP 429 above that [14]. Only a small number of sites are targeted, per the post [14].
- **Safari.** Per-site permission; iOS requires installation to Home Screen first [4]. The macOS permission UI is UNVERIFIED beyond the Notifications Center reference [15].

## 5. Hosted vendor constraints

**OneSignal** [18]
- Web push free tier: max 10,000 subscribers per send. Growth: $0.004 per web push subscriber. Push volume unlimited on paid tiers.
- Data export: a "Notification Data Exports (CSV)" row exists, but the check marks did not render, so inclusion per tier is UNVERIFIED.
- Subscriber data ownership and export beyond that feature: UNVERIFIED. Their own quickstart and Safari docs returned 404; iOS handling UNVERIFIED.

**Firebase Cloud Messaging (web)** [17]
- Requires HTTPS and a root-level `firebase-messaging-sw.js`. Uses VAPID keys (Google-issued, configured per Firebase project).
- Browser support: "browsers that support the Push API"; no versions or iOS/Safari statement.
- Registration tokens are deprecated in favour of Firebase Installation IDs [17]. Lock-in to Firebase project credentials is likely but not fetched.

**Pusher Beams** [19]
- Describes itself as an API for iOS, Android and Web. No web-push limits, Safari/iOS Home Screen statement, retention or export policy found. Own credentials vs VAPID: UNVERIFIED.

**Courier** [20]
- Developer plan: free, 10,000 sends/month. Business: $0.005 per send, no monthly cap. Web push not named as a channel (channels "email, SMS, push, in-app, and chat").

**Knock** [21]
- Free: 10,000 messages sent. Starter: $250/month plus usage. Log retention 30 days on Free/Starter, 90 on Enterprise. Web push not named. No export statement found.

## 6. Recommendation

**Default channel: email. Web Push: opt-in secondary channel for users who have granted permission.**

Reasons:
1. **Reach.** iOS Safari users reach push only after installing to Home Screen [4]. Desktop Safari and Firefox users still need a gesture-gated prompt [8][12].
2. **Opt-in cost.** Users can permanently block the prompt and the site cannot recover it [6]. Email needs no browser permission.
3. **Subscription churn.** Endpoints expire and must be pruned on 404 and 410 [2]. Email addresses change far less often.
4. **Reliability.** Push depends on browser and push-service availability; Chrome rate-limits low-engagement senders [14]. Email is the simpler delivery path.
5. **Vendor coupling.** Hosted push vendors sit between Cadence and the browser. Pricing is per subscriber or per send; web push is absent or unnamed on several vendors' public pricing [18][20][21]. Self-hosting VAPID avoids lock-in but adds a sender service and subscription store.

Trade-offs of push: near-instant delivery, higher engagement once opted in, no email deliverability work. The opt-in rate is UNVERIFIED; no fetched source gives a number, so do not plan against a figure.

If Cadence builds push: use VAPID self-hosted (RFC 8292), a `userVisibleOnly: true` subscription, a notification on every push, a gesture-triggered custom dialog before the native prompt, and 404/410 pruning.

## 7. Sources

1. RFC 8292, VAPID. https://www.rfc-editor.org/rfc/rfc8292 (accessed 2026-11-18)
2. RFC 8030, Generic Event Delivery Using HTTP Push. https://www.rfc-editor.org/rfc/rfc8030 (accessed 2026-11-18)
3. RFC 8291, Message Encryption for Web Push. https://www.rfc-editor.org/rfc/rfc8291 (accessed 2026-11-18)
4. WebKit, Web Push for web apps on iOS and iPadOS. https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ (accessed 2026-11-18)
5. web.dev, Push notifications overview. https://web.dev/articles/push-notifications-overview (accessed 2026-11-18)
6. web.dev, Permission UX for push notifications. https://web.dev/articles/push-notifications-permissions-ux (accessed 2026-11-18)
7. MDN, Push API. https://developer.mozilla.org/en-US/docs/Web/API/Push_API (accessed 2026-11-18)
8. MDN, Notification.requestPermission(). https://developer.mozilla.org/en-US/docs/Web/API/Notification/requestPermission_static (accessed 2026-11-18)
9. MDN, Secure contexts. https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts (accessed 2026-11-18)
10. MDN, ServiceWorkerContainer.register(). https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register (accessed 2026-11-18)
11. MDN, Using Service Workers. https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers (accessed 2026-11-18)
12. MDN, PushManager.subscribe(). https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe (accessed 2026-11-18)
13. Chrome for Developers, Push Notifications on the Open Web. https://developer.chrome.com/blog/push-notifications-on-the-open-web (accessed 2026-11-18; article self-described as old)
14. Chrome for Developers, Increasing web push notification value with rate limits (2026-01-06). https://developer.chrome.com/blog/web-push-rate-limits (accessed 2026-11-18)
15. WebKit, News from WWDC22: WebKit features in Safari 16 beta. https://webkit.org/blog/11341/whats-new-in-safari-16/ (accessed 2026-11-18)
16. W3C, Push API. https://www.w3.org/TR/push-api/ (accessed 2026-11-18)
17. Firebase, Set up a JavaScript Firebase Cloud Messaging client app. https://firebase.google.com/docs/cloud-messaging/js/client (accessed 2026-11-18)
18. OneSignal, Pricing. https://onesignal.com/pricing (accessed 2026-11-18)
19. Pusher, Beams documentation. https://pusher.com/docs/beams/ (accessed 2026-11-18)
20. Courier, Pricing. https://www.courier.com/pricing (accessed 2026-11-18)
21. Knock, Pricing. https://knock.app/pricing (accessed 2026-11-18)
22. Chrome for Developers, Lighter notification prompts on Android (search snippet only, not fetched). https://developer.chrome.com/blog/notification-prompts-android?hl=en (accessed 2026-11-18)

Failed fetches: Apple developer page (https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers returned title only); Chrome quieter-prompt blog and Chrome 67 post (404); OneSignal quickstart (404).
