# learnix-inactivity-7d — Workflow Reference

Sends a re-engagement email to students who started a course but haven't touched it in 7+ days. Runs every morning at 09:00 UTC.

---

## Overview

The workflow starts with a scheduled trigger that runs every day at 09:00 UTC. This initiates the process of checking for inactive students who meet specific criteria such as inactivity duration and progress percentage.

Next, an HTTP request is made to fetch the list of inactive students from the backend. The response contains an `items` array, which is immediately split into individual items by the Split Out node so each student flows through the rest of the workflow independently.

The Loop Over Items node fans out the items one by one in sequential batches of 4.

For each user, the first check determines whether email notifications are enabled. If notifications are disabled, the item is skipped and the loop continues to the next user.

If notifications are enabled, the workflow creates a deduplication log entry. This step ensures that the same user does not receive duplicate emails for the same automation event on the same day.

After logging, the workflow checks whether the log entry was newly created. If the entry already exists, the user has already been processed today and the loop continues to the next user.

If the deduplication check passes, an email is sent to the user using a predefined inactivity template. The email includes personalized information such as the student's name, course title, progress percentage, and a resume link.

After the email is sent (success or error), control returns to Loop Over Items to continue with the next batch. If sending fails, a rollback step removes the deduplication log entry so the user can be retried in a future run before looping continues.

---

## Node-by-node

### 1. Schedule Trigger — `scheduleTrigger`

Fires on cron `0 9 * * *` (daily at 09:00 UTC). No input; starts the execution chain.

---

### 2. Fetch Inactive Students — `httpRequest GET`

```
GET $BASE_URL/api/notifications/inactive-students
  ?inactiveDays=7
  &minProgressPct=10
  &maxProgressPct=99
```

Authenticated with the `Bearer Auth account` Bearer credential.

Returns:

```json
{
  "generatedAt": "2026-05-17T09:00:00.000Z",
  "items": [
    {
      "userId": "...",
      "email": "alice@example.com",
      "name": "Alice",
      "emailNotificationsEnabled": true,
      "courseId": "...",
      "courseTitle": "Introduction to TypeScript",
      "progressPct": 42,
      "nextLessonTitle": "Generics & Utility Types",
      "resumeUrl": "https://learnix.app/dashboard/courses/.../learn/...",
      "unsubscribeUrl": "https://learnix.app/unsubscribe?token=<jwt>",
      "lastActivityAt": "2026-05-09T14:23:00.000Z",
      "dedupKey": "user123:inactivity_7d:course456:2026-05-17"
    }
  ]
}
```

Server-side filters applied before returning:
- `lastActivityAt` older than `inactiveDays` days
- `progressPct` between `minProgressPct` and `maxProgressPct`
- At least one completed lesson (students who never started are excluded)

---

### 3. Split Out — `splitOut`

Splits the `items` field of the Fetch response into individual items — one item per student/course pair. After this node, each item's `$json` is a single student record from the array.

---

### 4. Loop Over Items — `splitInBatches`

Processes items in sequential batches of 4. On each pass it emits one batch via output 1 (items available) or ends via output 0 (no more items). The workflow explicitly loops back from the final node in each branch so all items are processed.

---

### 5. Notifications Enabled? — `if`

```
$json.emailNotificationsEnabled === true
```

- **true →** continue to Log (dedup)
- **false →** loop back to Loop Over Items (skip this user, process next)

This check is a fast client-side guard. The email service also re-checks opt-out status server-side before sending.

---

### 6. Log (dedup) — `httpRequest POST`

```
POST $BASE_URL/api/notifications/log
```

Body:

```json
{
  "dedupKey": "user123:inactivity_7d:course456:2026-05-17",
  "userId": "user123",
  "automation": "inactivity_7d",
  "payload": { ...full student item... }
}
```

The `dedupKey` format is `{userId}:inactivity_7d:{courseId}:{YYYY-MM-DD}`. The server tries to insert a row with a unique constraint on `dedupKey`. If a row already exists (same student, same course, same day), it returns `{ created: false }`.

Response: `{ "created": true | false }`

---

### 7. Not Duplicate? — `if`

```
$json.created === true
```

- **true →** continue to Send Email (first time today for this student+course)
- **false →** loop back to Loop Over Items (already sent today, skip)

---

### 8. Send Email — `httpRequest POST`

```
POST $BASE_URL/api/notifications/send-email
```

Body:

```json
{
  "templateKey": "engagement.inactivity-7d",
  "toEmail": "<from Loop Over Items>",
  "userId": "<from Loop Over Items>",
  "payload": {
    "studentName": "Alice",
    "courseTitle": "Introduction to TypeScript",
    "nextLessonTitle": "Generics & Utility Types",
    "resumeUrl": "https://learnix.app/...",
    "progressPct": 42,
    "unsubscribeUrl": "https://learnix.app/unsubscribe?token=..."
  }
}
```

All `payload` fields are pulled from **Loop Over Items** (not from the Log node) because the Log response only contains `{ "created": boolean }`.

**On success:** loops back to Loop Over Items to advance to the next user.  
**On error:** routes to HTTP Request (Rollback Log) via the error output so a single failure doesn't abort the whole run.

---

### 9. HTTP Request (Rollback Log) — `httpRequest DELETE`

```
DELETE $BASE_URL/api/notifications/log?dedupKey=<value>
```

The `dedupKey` is taken from **Loop Over Items** (the original student item), not from the Log response.

Removes the dedup row so the student can be retried in the next run. On completion loops back to Loop Over Items.

---

## Flow diagram

```
Cron 09:00 UTC
  └─► Fetch Inactive Students
        └─► Split Out
              └─► Loop Over Items ◄──────────────────────────────────────────┐
                    └─► Notifications Enabled?                                │
                          ├─ false ──────────────────────────────────────────►┤
                          └─ true ──► Log (dedup)                             │
                                        └─► Not Duplicate?                    │
                                              ├─ false ──────────────────────►┤
                                              └─ true ──► Send Email          │
                                                            ├─ ok ────────────┤
                                                            └─ err ──► HTTP Request (Rollback Log) ──►┘
```

---

## Credentials

| Credential | Type | Used by |
|------------|------|---------|
| `Bearer Auth account` | HTTP Bearer Auth | All HTTP Request nodes (`Authorization: Bearer <token>`) |

The bearer token must match `server/services/notifications/auth.ts`.

---

## Environment variables

| Variable | Example | Description |
|----------|---------|-------------|
| `BASE_URL` | `https://learnix.app` | Learnix app origin (no trailing slash) |

---

## Dedup key format

```
{userId}:inactivity_7d:{courseId}:{YYYY-MM-DD}
```

One email per student per course per calendar day. The date is the UTC date at the time the API runs (09:00 UTC).