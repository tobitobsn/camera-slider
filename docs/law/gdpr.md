# EU GDPR / German DSGVO — the concrete rules

> **Applies when `.ai-eng-kit` → `law` includes `gdpr`** — the product is offered to people in the EU
> or EEA, or the controller sits there. Germany's national additions (BDSG, TDDDG, DDG) are included,
> marked as such. If `gdpr` is not recorded, this file does not describe this project's obligations.
> When more than one law is recorded, `/dsgvo` applies the stricter form of each duty.
>
> This is an engineering reference, not legal advice. Written 2026-08-21 against the GDPR as in force
> (retention periods corrected 2026-09-07 to the post-BEG-IV figures);
> a lawyer or Datenschutzbeauftragter confirms it for the individual case.

The *workflow* — which data, which duties, how they become acceptance criteria — lives in `/dsgvo`
and is the same under every law. This file holds what the GDPR in particular requires and calls things.

---

## Vocabulary

_Reached from `/dsgvo` throughout — use these words, because they are the ones in any letter the user will receive._

| English | German (use alongside) | Meaning |
|---|---|---|
| controller | **Verantwortlicher** | the company or person who decides why and how data is processed |
| processor | **Auftragsverarbeiter** | a service processing data on the controller's behalf |
| data processing agreement (DPA) | **Auftragsverarbeitungsvertrag (AVV)** | the Art. 28 contract with every processor |
| data protection officer (DPO) | **Datenschutzbeauftragter (DSB)** | mandatory in Germany from 20 employees regularly processing personal data automatically (§ 38 BDSG) |
| record of processing activities | **Verarbeitungsverzeichnis** | Art. 30 — `docs/privacy.md` maps closely onto it |
| supervisory authority | **Aufsichtsbehörde / Landesdatenschutzbehörde** | one per German Land; the data protection authority of the controller's member state elsewhere |
| data protection impact assessment (DPIA) | **Datenschutz-Folgenabschätzung (DSFA)** | Art. 35 |
| privacy policy | **Datenschutzerklärung** | Art. 13/14 information duties |

Never describe the app as *compliant*, *GDPR-compliant*, *DSGVO-konform*, *rechtssicher* — the boundary in `/dsgvo` applies.

## Lawfulness — one legal basis per purpose (Art. 6)

_Reached from `/dsgvo` step 3._

Under the GDPR, processing is **prohibited unless a legal basis applies**. For each purpose, name the
basis and say why it fits. This is where most projects are casually wrong:

- **Contract** (Art. 6(1)(b)) — data you genuinely need to deliver what the user signed up for. The account, the order, the booking.
- **Consent** (Art. 6(1)(a)) — marketing, newsletters, non-essential analytics, tracking. Must be freely given, specific, informed, and **as easy to withdraw as to give** (Art. 7). Pre-ticked boxes and cookie walls are not consent.
- **Legal obligation** (Art. 6(1)(c)) — invoices and tax retention. In Germany: **8 years for invoices and accounting records** (§ 147 Abs. 3 AO, § 257 Abs. 4 HGB, § 14b UStG — shortened from 10 by the Bürokratieentlastungsgesetz IV, in force 2025-01-01) and **10 years for books, inventories and annual accounts**. Note the tension: this *overrides* a deletion request for those records, and the user must be told that.
- **Legitimate interest** (Art. 6(1)(f)) — fraud prevention, security, basic operations. Requires a balancing test, and it is **not** available for special category data.
- **Vital interests / public task** — rarely relevant here.

Classic mistakes to flag: analytics or newsletter riding on "contract", one blanket consent covering several unrelated purposes, "legitimate interest" used as a catch-all.

## Sensitive data and protected groups

_Reached from `/dsgvo` step 2._

- **Special category data (Art. 9)** — health, biometrics, genetics, ethnicity, political opinion, religion, trade union membership, sex life or orientation. Processing needs an Art. 9(2) ground — usually **explicit consent** — and legitimate interest does not apply. A "notes" field on a therapy-booking app is health data whether it was designed to be or not.
- **Criminal convictions (Art. 10)** — a separate regime again.
- **Children's data** — under **16 in Germany** without parental consent (Art. 8); a product that will obviously attract minors needs a plan.
- **Employee data** — its own regime in Germany (§ 26 BDSG).

## Duties and their articles

_Reached from `/dsgvo` step 4 — the article to cite beside each proposed acceptance criterion._

| Duty | GDPR | What the AC usually says |
|---|---|---|
| Information | Art. 13/14 | a privacy policy reachable from every page, before or at collection |
| Access / copy | Art. 15 | the user can obtain what is stored about them |
| Rectification | Art. 16 | the user can correct their data |
| Erasure | Art. 17 | account deletion removes the data within a stated period; records under a statutory retention duty remain and the user is told |
| Portability | Art. 20 | export in a machine-readable form |
| Objection | Art. 21 | for legitimate-interest processing and direct marketing |
| Consent management | Art. 7 | recorded, timestamped, withdrawable; withdrawal actually stops the processing |
| Data minimisation | Art. 5(1)(c) | every field justified by its purpose; the cheapest measure is not collecting the field |
| Storage limitation | Art. 5(1)(e) | every entity has a deletion rule |
| Security | Art. 32 | encryption in transit and at rest, access limited at the data layer |
| Privacy by design / by default | Art. 25 | defaults to the least data, strictest visibility |
| Response deadline | Art. 12(3) | **one calendar month**, extendable by two for complex cases if the person is told within the first |
| Breach notification | Art. 33/34 | to the supervisory authority **within 72 hours** where there is a risk; to the people affected where the risk is high |

**AC example, both languages** — English: "Given a logged-in user, when they delete their account, then their profile data and posts are removed within 30 days; invoices under a statutory retention duty remain and the user is told so." · Deutsch: "Angenommen ein eingeloggter Nutzer, wenn er sein Konto löscht, dann werden seine Profildaten und Beiträge innerhalb von 30 Tagen entfernt; Rechnungen mit gesetzlicher Aufbewahrungspflicht bleiben erhalten, und der Nutzer wird darauf hingewiesen."

## Stack and launch specifics

_Reached from `/dsgvo` step 5 and `/deploy` step 5._

- **Where the data sits.** Inside the EU/EEA is the default expectation — for a German audience usually a Frankfurt region. Outside it, see transfers.
- **Processors (Art. 28).** Every service that touches personal data on the project's behalf needs an **AVV / DPA** — usually a checkbox or a downloadable document in the provider's dashboard. Build the list from *this* project's dependencies and configuration.
- **Third-country transfers (Chapter V, Art. 44 ff.).** US-based providers need a transfer mechanism; most large ones self-certify under the **EU-US Data Privacy Framework**, otherwise standard contractual clauses. Worth naming, not worth agonising over — but the user should know which of their providers are US companies.
- **Cookies, analytics, pixels — Germany: consent *before* loading** (TDDDG § 25, ex-TTDSG). A banner that fires the tracker on page load regardless is the single most common finding in German audits. Strictly necessary cookies are exempt.
- **Legal notice.** Germany requires an **Impressum** (DDG) for commercial sites — its own obligation, independent of data protection — and a **Datenschutzerklärung** as soon as any personal data is processed, which includes server logs. Both are pre-launch items; the user needs a lawyer or a reputable generator, not you.
- **Error tracking** captures request data, which regularly includes personal data; scrubbing must be switched on deliberately (`docs/production/error-tracking.md`).

## DPIA threshold (Art. 35)

_Reached from `/dsgvo` step 6._

Do not write a DPIA; say whether one is likely required, and what triggers it:

- systematic and extensive automated evaluation of people, including profiling with legal or similarly significant effects
- large-scale processing of special category data
- systematic large-scale monitoring of a publicly accessible area
- anything on the supervisory authority's blacklist (**each German Land publishes one**; the DSK list applies nationally)

Two or more indicators → a DPIA is likely required and belongs with a lawyer or the DSB. None → say so; most small MVPs need none, and saying that clearly is genuinely useful.

## German specifics worth knowing

- A **Datenschutzbeauftragter is mandatory from 20 employees** who regularly process personal data automatically (§ 38 BDSG).
- Employee data has its own regime (§ 26 BDSG).
- Tax and commercial retention (**§ 147 AO, § 257 HGB — 8 years for invoices and accounting records since 2025-01-01, 10 years for books and annual accounts**) beats deletion requests for the affected records.
- Fines are imposed on the **company** (Art. 83): up to 4 % of global annual turnover or EUR 20 million.
