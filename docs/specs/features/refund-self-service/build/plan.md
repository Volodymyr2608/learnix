# Refund self-service — Implementation plans (index)

← [Spec](../spec.md) · [Feature map](../README.md)

The feature was built in nine vertical slices, each with its own approved plan, executed with TDD and
closed by `/qa`. Every plan is frozen once its slice shipped; the spec and `security.md` are the
current state.

| Slice | Plan | What it delivers |
|---|---|---|
| 1 | [`slice-1-auto-decision.md`](slice-1-auto-decision.md) | Request + automatic decision under a per-student lock |
| 2 | [`slice-2-hold-and-release.md`](slice-2-hold-and-release.md) | Instructor share held for the window, then released |
| 3 | [`slice-3-refund-effects.md`](slice-3-refund-effects.md) | Approved requests refunded through Stripe; every refund path applies its effects exactly once |
| 4 | [`slice-4-disputes.md`](slice-4-disputes.md) | Disputes on held and paid-out sales |
| 5 | [`slice-5-payout-monitoring.md`](slice-5-payout-monitoring.md) | Admin payout monitoring, retries and alert emails |
| 6 | [`slice-6-content-gate.md`](slice-6-content-gate.md) | Content gate: AI features serve only lessons the student has opened |
| 7 | [`slice-7-student-ui.md`](slice-7-student-ui.md) | Student UI and `/pricing` |
| 8 | [`slice-8-appeals.md`](slice-8-appeals.md) | Appeals and the admin exception |
| 9 | [`slice-9-rest.md`](slice-9-rest.md) | The rest (P2/P3) |

Decisions each plan made that the spec did not are logged in
[`../journal/ai-decision-log.md`](../journal/ai-decision-log.md).
