# learnix-near-completion — Workflow Reference

Sends a motivational nudge email when a student has only 1–2 lessons left in a course. Triggered by a webhook fired from the Learnix backend when a lesson is marked complete and the remaining count crosses the threshold.

---

## Overview

The workflow starts when the Learnix backend fires a webhook event after a student's progress crosses the near-completion threshold. The webhook is responded to immediately so the backend is not blocked.

The request is passed to an HMAC verification step that validates the `X-Learnix-Signature` header. If the signature is invalid, the workflow throws and stops.

After verification, the workflow checks whether the student has email notifications enabled. If not, processing stops.

If notifications are enabled, a deduplication log entry is created to ensure the nudge email is only sent once per student per course, even if multiple lessons are completed in quick succession.

After logging, the workflow checks whether the log entry was newly created. If it already exists, the student has already been nudged and processing stops.

If the dedup check passes, the near-completion email is sent with personalized details including the student's name, course title, lessons remaining, and a link to the next lesson.

If any error occurs during sending, a rollback step removes the dedup log entry so the email can be retried on the next event.

---

## Node-by-node

### 1. Webhook — `webhook`

Listens on path `progress.near_completion`. Configured in `responseMode: responseNode` so the response is sent by node 2 before processing continues.

Payload shape sent by the backend:

```json
{
  "eventId": "<uuid>",
  "type": "progress.near_completion",
  "occurredAt": "2026-05-17T09:00:00.000Z",
  "user": {
    "id": "user123",
    "email": "alice@example.com",
    "name": "Alice",
    "emailNotificationsEnabled": true,
    "unsubscribeToken": "<jwt>"
  },
  "course": {
    "id": "course456",
    "title": "Introduction to TypeScript"
  },
  "progress": {
    "completedLessons": 8,
    "totalLessons": 10,
    "lessonsRemaining": 2,
    "nextLessonId": "lesson-9",
    "nextLessonTitle": "Generics & Utility Types",
    "nextLessonUrl": "https://learnix.app/dashboard/courses/course456/learn/lesson-9"
  },
  "unsubscribeUrl": "https://learnix.app/unsubscribe?token=<jwt>"
}
```

---

### 2. Respond to Webhook — `respondToWebhook`

Immediately returns HTTP 200 with no body so the Learnix backend is not blocked. Runs in parallel with node 3.

---

### 3. Verify HMAC — `code`

Validates `X-Learnix-Signature: sha256=<hex>` against `HMAC-SHA256(body, N8N_WEBHOOK_SECRET)`. Throws if the signature does not match, stopping the execution. Passes all items through unchanged on success.

---

### 4. Notifications Enabled? — `if`

```
$json.user.emailNotificationsEnabled === true
```

- **true →** continue to Log (dedup)
- **false →** end (student opted out)

---

### 5. Log (dedup) — `httpRequest POST`

```
POST $BASE_URL/api/notifications/log
```

Body:

```json
{
  "dedupKey": "user123:near_completion:course456",
  "userId": "user123",
  "automation": "near_completion",
  "payload": { ...full webhook payload... }
}
```

The `dedupKey` format is `{userId}:near_completion:{courseId}` — one nudge per student per course. If a row already exists, the server returns `{ "created": false }`.

Response: `{ "created": true | false }`

---

### 6. Not Duplicate? — `if`

```
$json.created === true
```

- **true →** continue to Send Email
- **false →** end (already sent for this course)

---

### 7. Send Email — `httpRequest POST`

```
POST $BASE_URL/api/notifications/send-email
```

Body:

```json
{
  "templateKey": "engagement.near-completion",
  "toEmail": "<from Webhook>",
  "userId": "<from Webhook>",
  "payload": {
    "studentName": "Alice",
    "courseTitle": "Introduction to TypeScript",
    "lessonsRemaining": 2,
    "nextLessonUrl": "https://learnix.app/...",
    "unsubscribeUrl": "https://learnix.app/unsubscribe?token=..."
  }
}
```

All fields reference **Webhook** directly to avoid losing the original payload after the Log node overwrites `$json`.

**On success:** execution ends.  
**On error:** routes to Rollback Log via the error output so a failure doesn't leave the dedup row orphaned.

---

### 8. Rollback Log — `httpRequest DELETE`

```
DELETE $BASE_URL/api/notifications/log?dedupKey=user123:near_completion:course456
```

The dedupKey is reconstructed from **Webhook** data (`user.id + ':near_completion:' + course.id`) since the Log response only contains `{ "created": boolean }`.

Removes the dedup row so the email can be retried when the next lesson-complete event fires.

---

## Flow diagram

```
Webhook (progress.near_completion)
  ├─► Respond to Webhook  (immediate 200)
  └─► Verify HMAC
        └─► Notifications Enabled?
              ├─ false ──► (end)
              └─ true ──► Log (dedup)
                             └─► Not Duplicate?
                                   ├─ false ──► (end)
                                   └─ true ──► Send Email
                                                 ├─ success ──► (end)
                                                 └─ error  ──► Rollback Log ──► (end)
```

---

## Credentials

| Credential | Type | Used by |
|------------|------|---------|
| `Bearer Auth account` | HTTP Bearer Auth | Log (dedup), Send Email, Rollback Log |

---

## Dedup key format

```
{userId}:near_completion:{courseId}
```

One nudge per student per course, lifetime. Once sent, the dedup row persists and the student will not receive another near-completion email for the same course even on re-enrollment.