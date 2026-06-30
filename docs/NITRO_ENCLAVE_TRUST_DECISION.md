# VHS and AWS Nitro Enclaves: Trust Decision Memo

**Date:** 2026-06-30
**Scope:** The Validator History Service (VHS) instance in the Dynamic UNL scoring trust model
**Decision:** Do **not** adopt AWS Nitro Enclaves for VHS. Address the trust concern by publishing the signed validation votes VHS observes and, as a stronger step, by supporting multiple independent observers.

---

## 1. The question

Dynamic UNL scoring decides which validators the network should trust. The only signal in that decision that measures validator *quality* is the agreement metric, and that metric comes entirely from VHS. Because the foundation operates the VHS instance, a fair question keeps recurring:

> If the foundation runs the box that produces the validator-quality numbers, can it shape those numbers — and how do we prove to the community that it does not?

AWS Nitro Enclaves were proposed as the answer. This memo evaluates whether an enclave is the right instrument for this specific concern. It concludes that it is not, and that the concern is better — and more cheaply — addressed by publishing data that is already cryptographically signed at its source.

## 2. What a Nitro Enclave actually provides

A Nitro Enclave is a confidential-computing environment: an isolated compartment carved out of an EC2 host where code runs such that even the host operator cannot read its memory or alter its execution. The enclave can emit a signed *attestation* proving which exact code image is running inside it, so a remote party can trust the enclave's output without trusting the operator.

In one line: **an enclave proves the computation was honest.** It guarantees that a specific, audited program processed its inputs without tampering, and lets outsiders verify that fact.

This is a real and valuable property — for the right problem. The right problem is computing over data that must stay secret while still proving the computation was correct. That is not the problem VHS has.

## 3. How VHS produces its numbers

The evaluation has to start from how VHS actually works, because that determines what can and cannot be attacked.

**Ingestion.** VHS opens connections to a set of ledger nodes — network entry anchors plus the peers it discovers by crawling — subscribes each to the live `validations` stream, and crawls peers to map topology. The agreement metric is built entirely from the validation stream. Critically, **every validation is an individually signed message** at the protocol level: it carries the validator's key and a signature over the vote, so its authenticity is independently verifiable by anyone who holds the raw message. VHS does not invent these; it observes them. (VHS treats the votes it receives as authentic on the ingestion path rather than re-checking each signature itself; the point that matters here is that the signature exists at the source, so a third party given the raw votes can verify them.)

**Computation.** For each validator, per time window (1h / 24h / 30d), VHS performs a set comparison against the ledgers the network agreed on:

- `validated` = ledgers the network agreed on that this validator also signed
- `missed` = ledgers the network agreed on that this validator did **not** sign
- `score` = `validated / (validated + missed)`

"Ledgers the network agreed on" is the set of ledgers VHS observed more than one validator voting for. That set is therefore **VHS's own observed picture**, derived from its vantage point on the network.

Two facts fall out of this and drive the whole decision:

1. **The raw inputs are signed at source.** A validator's vote carries a signature over its contents, so it cannot be forged and anyone holding the raw vote can verify it independently of who runs VHS. Input authenticity is a property of the data itself, not something the tallying environment has to provide.
2. **The derived score is vantage-dependent.** The denominator — what counts as "the network's ledgers" — is whatever VHS observed. Two honest observers at different points in the network would compute slightly different scores. The score is not faked; it is a function of an observation.

## 4. Computation integrity vs. input integrity and observation completeness

This is the crux. An enclave proves *computation integrity*. The VHS concern is not about computation integrity at all.

- **Input authenticity** — "are the votes real?" — is **already solved by the source-level signatures.** Each vote is verifiable by anyone who holds it, so an enclave adds nothing here; the data is unforgeable whether or not the tally runs in a sealed box.
- **Observation completeness** — "did VHS see *all* the votes, or could it omit some to bias a validator's score?" — is the residual gap. This is the property a skeptic actually cares about.

An enclave **cannot** close the observation-completeness gap, for a structural reason: an enclave has no direct network access. All traffic reaches it through the operator-controlled host and is passed in over the host's proxy. The enclave can faithfully attest *"I tallied every vote I received"* — but it can never attest *"I received every vote that exists,"* because votes can be withheld or filtered on the host **before** they ever reach the enclave. The attestation would remain perfectly valid over a starved input set.

So an enclave does not remove the trust assumption; it **moves** it — from "trust the VHS code" to "trust the host network path that feeds the enclave." For the one property that matters here, that is not progress.

## 5. Architectural mismatch

Even setting the trust argument aside, VHS is a poor technical fit for an enclave:

- **No direct network.** VHS's entire purpose is to hold live connections to peers and listen to votes. In an enclave, every byte of that traffic is funneled through the host first — which is exactly where the completeness gap reopens.
- **No persistent storage.** VHS relies on a PostgreSQL history. That database lives *outside* the enclave, so the tamper-proof boundary would cover only the in-memory tally, not the stored record — while presenting the whole service as "sealed."
- **Re-platforming cost.** VHS is a long-running, multi-process, network-bound, stateful service. Enclaves are compute-only — no accelerators, no direct network, no disk — and AWS-specific. Wrapping VHS in one means real engineering effort for a guarantee that, per Section 4, does not address the actual concern.

## 6. The approach that does address the concern

The design philosophy of Dynamic UNL scoring is maximal transparency: all scoring inputs are chosen to be publicly publishable (this is why licensing-restricted data sources were deliberately excluded from the pipeline). An enclave is a tool for computing over data you must keep *secret*. This system keeps nothing secret. The enclave is therefore solving a problem this design deliberately does not have.

Because the inputs are signed, the honest and cheaper path is to **publish them and let anyone check the work.**

**Step 1 — Publish the observed signed votes.** Include the signed validation votes VHS observed for a round in that round's published audit material. Anyone can then re-run the exact set comparison and independently confirm every validator's agreement score. This converts "trust our numbers" into "check our numbers," with no dependency on any cloud provider. Its honest limit: it proves the math over the *published* set, not that the published set is complete.

**Step 2 — Support multiple independent observers.** Have several parties each record and publish the signed validations they observed, and union the signed sets. Because every vote is signed, no observer can hide a vote that another observer captured, and no single vantage point is authoritative. This closes the observation-completeness gap that neither Step 1 nor an enclave can close.

For a decentralization-minded audience, open signed data plus independent redundancy is also a **more credible** trust story than a hardware attestation rooted in a single cloud provider.

## 7. Recommendation

**Do not adopt AWS Nitro Enclaves for the VHS instance.** It targets computation integrity, which is not the VHS concern; it cannot guarantee observation completeness, which is; and it is a poor architectural fit for a network-bound, stateful service.

Instead, address the trust question with the data that is already signed at its source:

1. **Near term:** publish the signed validation votes VHS observed, so the agreement scores become independently recomputable.
2. **Stronger step:** support multiple independent observers that record and pool their signed observations, removing any single authoritative vantage point.

This delivers verifiable trust where an enclave would deliver only the appearance of it.
