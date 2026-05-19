# learnix-certificate-earned — Workflow Reference

Sends a certificate email when a student completes a course. Triggered by a webhook fired from the Learnix backend at the moment of completion.

---

## Overview

The workflow starts when the Learnix backend fires a webhook event after a student earns a certificate. The webhook is responded to immediately (fire-and-forget) so the backend is not blocked.

The request is then passed to an HMAC verification step that validates the `X-Learnix-Signature` header. If the signature is invalid, the workflow throws and stops — no email is sent.

After verification, the workflow checks whether the student has email notifications enabled. If not, processing stops.

If notifications are enabled, a deduplication log entry is created to ensure the certificate email is only sent once per enrollment, even if the event fires multiple times.

After logging, the workflow checks whether the log entry was newly created. If it already exists, the student has already been emailed and processing stops.

If the dedup check passes, the certificate email is sent to the student with personalized details including their name, course title, instructor name, and a link to download the certificate PDF.

If any error occurs during sending, a rollback step removes the dedup log entry so the email can be retried in a future event.

---

## Node-by-node

### 1. Webhook — `webhook`

Listens on path `certificate.earned`. Configured in `responseMode: responseNode` so the response is sent by node 2 before processing continues.

Payload shape sent by the backend:

```json
{
  "user": {
    "id": "user123",
    "email": "alice@example.com",
    "name": "Alice",
    "emailNotificationsEnabled": true,
    "unsubscribeToken": "<jwt>"
  },
  "course": {
    "id": "course456",
    "title": "Introduction to TypeScript",
    "instructorName": "Bob Smith"
  },
  "enrollment": {
    "id": "enr789",
    "completedAt": "2026-05-17T09:00:00.000Z"
  },
  "certificatePdfUrl": "https://learnix.app/certificates/enr789.pdf",
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
  "dedupKey": "user123:certificate:enr789",
  "userId": "user123",
  "automation": "certificate",
  "payload": { ...full webhook payload... }
}
```

The `dedupKey` format is `{userId}:certificate:{enrollmentId}` — unique per student per enrollment. If a row already exists, the server returns `{ "created": false }`.

Response: `{ "created": true | false }`

---

### 6. Not Duplicate? — `if`

```
$json.created === true
```

- **true →** continue to Send Email
- **false →** end (already sent for this enrollment)

---

### 7. Send Email — `httpRequest POST`

```
POST $BASE_URL/api/notifications/send-email
```

Body:

```json
{
  "templateKey": "course.certificate",
  "toEmail": "<from Webhook>",
  "userId": "<from Webhook>",
  "payload": {
    "studentName": "Alice",
    "courseTitle": "Introduction to TypeScript",
    "instructorName": "Bob Smith",
    "certificatePdfUrl": "https://learnix.app/certificates/enr789.pdf",
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
DELETE $BASE_URL/api/notifications/log?dedupKey=user123:certificate:enr789
```

The dedupKey is reconstructed from **Webhook** data (`user.id + ':certificate:' + enrollment.id`) since the Log response only contains `{ "created": boolean }`.

Removes the dedup row so the email can be retried when the webhook fires again.

---

## Flow diagram

```
Webhook (certificate.earned)
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
| `learnix-api` | HTTP Header Auth | Log (dedup), Send Email, Rollback Log |

---

## Dedup key format

```
{userId}:certificate:{enrollmentId}
```

One email per student per enrollment. Since enrollment IDs are unique, a student who completes the same course twice (after re-enrollment) would get a second certificate email.