# Making Validator Agreement Scores Verifiable: A Two-Step Story

**Audience:** anyone encountering this for the first time — no prior context with VHS or Dynamic UNL scoring required.
**Companion document:** [`NITRO_ENCLAVE_TRUST_DECISION.md`](NITRO_ENCLAVE_TRUST_DECISION.md), which explains why a sealed-box (enclave) approach does *not* solve the problem this document does.

This document tells a single story in two steps — **Level 1** and **Level 2** — for turning the validator agreement scores VHS produces from "numbers you have to trust" into "numbers anyone can check."

---

## Start here: who keeps the score?

The Validator History Service (VHS) watches the PFT Ledger network and, for every validator, produces an **agreement score** — a measure of how reliably that validator does its job. Those scores are not cosmetic: Dynamic UNL scoring uses them to help decide which validators the network should trust.

So VHS is the **scorekeeper**, and its scores carry real weight. The obvious question about any scorekeeper is the one this document answers:

> Can we trust the score — or do we just have to take the scorekeeper's word for it?

Today, VHS is operated by the foundation and publishes the scores as finished numbers. You either trust them or you don't. That is the gap we want to close.

## What the score actually is

The agreement score is simpler than it sounds. For each validator, over a time window (1 hour, 24 hours, 30 days), VHS compares two sets of ledgers:

- **validated** — ledgers the network agreed on that this validator *also* signed
- **missed** — ledgers the network agreed on that this validator did *not* sign
- **score** = `validated / (validated + missed)`

"Ledgers the network agreed on" simply means the ledgers VHS observed more than one validator voting for. A validator that signs almost everything the network agreed on scores near 1.0; one that misses a lot scores lower.

Two facts about this are worth holding onto, because the whole story turns on them:

1. **The score is built from votes VHS observed** — that is, from VHS's own vantage point on the network.
2. **Every vote is a signed message.** (These votes are called *validations* in the protocol's own terms — this document just says "votes" for readability.) When a validator votes on a ledger, it cryptographically signs that vote. Nobody — not even VHS — can forge a validator's vote or put words in its mouth.

That second fact is the key that unlocks everything below.

## The realization: the raw material is already trustworthy

Because every vote is signed at its source, the *building blocks* of the score are not "the scorekeeper's word." They are tamper-proof pieces of evidence that anyone can check on their own.

The only thing missing is visibility. Today VHS publishes the **conclusion** (the score) but not the **evidence** (the signed votes it counted). Show the evidence, and trusting the scorekeeper stops being necessary — you can confirm the score yourself.

That single idea leads to two steps, each removing a different reason you'd have to take someone's word for it.

---

## Level 1 — Show your work

**In one line:** publish the signed votes VHS observed, so anyone can recompute the scores themselves.

**What gets published.** For each scoring window, VHS publishes the set of signed validations it observed — which validator signed which ledger — alongside the scores it derived from them.

**How anyone checks.** A third party takes the published votes and:

1. verifies each signature, confirming every vote is genuine and really came from the validator it claims to;
2. re-runs the exact same set comparison — counting `validated` and `missed` for each validator and dividing;
3. confirms the result matches the score VHS published.

The math is simple and deterministic: given the same votes, everyone arrives at the same scores. There is no model, no hidden step, nothing to trust.

**What this achieves.** It turns *"trust our numbers"* into *"check our numbers."* VHS can no longer publish a score that doesn't follow from the evidence, because the evidence is sitting right there and the computation is reproducible by anyone. And it costs almost nothing: the votes already exist — Level 1 simply stops hiding them.

**The honest limit.** Level 1 proves the score is correct **for the votes that were published.** It does *not* prove those were *all* the votes. A scorekeeper who quietly left some votes out of the published set could still nudge a validator's score down, and an honest recomputation would faithfully reproduce the biased result. In short: Level 1 secures the *math*, but not the *completeness of the evidence*.

That remaining gap is exactly what Level 2 is for.

---

## Level 2 — More than one witness

**In one line:** have several independent observers each publish the votes they saw, then combine them — so no single party decides what counts as "all the votes."

**The problem it solves.** A single observer (one VHS) sees the network from one place. It might *genuinely* miss some votes, or it could *deliberately* omit them. Either way, one vantage point is one point of trust — and Level 1 can't tell the two apart.

**How it works.** Run more than one observer — ideally operated by *different* parties — each independently watching the same network over the same scoring window and publishing the signed validations it witnessed. Because every vote is signed, the separate sets can be safely merged:

- a vote that *any* honest observer saw is provably genuine, so it can be included with confidence;
- no observer can hide a vote that another observer captured — the missing vote simply shows up in someone else's published set.

Take the **union** of everyone's signed votes and you get a fuller, cross-checked record of what actually happened on the network — one that no single operator controls.

**What this achieves.** The "did you see everything?" question no longer rests on one party. To suppress a vote now, *every* observer would have to miss or omit it at the same time — which independent, separately operated observers make implausible. The score becomes a function of a shared, multi-party record rather than one operator's private view.

**The honest limit.** Observers still need an agreed, well-defined rule for combining their records (a straightforward union), and the guarantee is only as strong as the observers are genuinely independent. A dozen observers all run by the same party buy very little. The goal is **diversity of operators and vantage points**, not merely more machines.

---

## How the two fit together

Level 1 is the foundation: publish the evidence so the scores are checkable at all. Level 2 builds directly on it: once everyone is already publishing signed votes, gathering those votes from several independent observers is the natural next step — and it closes the one gap Level 1 leaves open.

The progression, in plain terms:

- **Today:** trust the scorekeeper's numbers.
- **Level 1:** check the numbers yourself against published evidence. *(Secures the math.)*
- **Level 2:** check them against evidence gathered by many independent watchers. *(Secures completeness.)*

Each step removes one more reason to take anyone's word for it.

| | Question it answers | What it secures | Residual gap |
|---|---|---|---|
| **Level 1** | "Do the scores follow from the votes?" | The computation is reproducible by anyone | Are these *all* the votes? |
| **Level 2** | "Are these all the votes?" | No single vantage point decides | Observers must be genuinely independent |

## What neither level changes

Both levels are deliberately narrow. They do **not** change how VHS computes scores, who signs Validator Lists, or any consensus behavior. They only make the *existing* agreement scores independently verifiable. And both rest on the same foundation: validations are signed at the protocol source. That one property is what makes the evidence checkable — and is why this path, unlike a sealed box, actually closes the trust gap.

## In one paragraph

VHS scores validators from the votes it observes, and every vote is already cryptographically signed at its source. **Level 1** publishes those signed votes so anyone can re-run the simple agreement math and confirm the scores — replacing trust with verification, at almost no cost. **Level 2** has several independent observers publish what each of them saw and unions the signed sets, so completeness no longer depends on any single operator. Level 1 makes the scores checkable; Level 2 makes the evidence behind them complete. Together they turn the scorekeeper from someone you must trust into someone you can verify.
