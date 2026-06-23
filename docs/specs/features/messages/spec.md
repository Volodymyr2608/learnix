---
feature: messages
status: stable
models: []
depends-on: [auth]
---

## Purpose

Students and instructors need a direct way to ask/answer questions about a course without going
through email or support tickets — an in-app inbox tied to course context.

## Functional scope

- Inbox, thread view, and composer UI for direct messages between students and instructors.
- Start-conversation entry points from course/enrollment surfaces.
- Polling-based updates (no websockets) for new messages within an open thread.
- Unread badge in the sidebar reflects real unread count, wired to the inbox.

## Acceptance criteria

- A new message from either party appears in the recipient's inbox without a page reload (within
  the polling interval).
- The sidebar unread badge count always matches the number of threads with unread messages for the
  current user.
- Starting a conversation from a course page pre-fills the thread with that course's context.

## Agent notes

- Polling, not SSE/websockets — consistent with this feature only; don't assume other realtime
  features in the app use the same transport.