# Privacy Record — what this product does with personal data

> The honest overview of which personal data this product processes, why, and for how long.
>
> - Created and kept current by `/dsgvo`, one entry per processing purpose.
> - Grows with the product: when a feature changes what is stored, its entry changes too.
> - **Altitude:** purposes, legal bases, retention, and who else sees the data. Field-level detail lives in `docs/data-model.md` and the feature designs.
>
> This maps closely onto the record of processing activities (*Verarbeitungsverzeichnis*, Art. 30 GDPR; Art. 12 Swiss DSG) — but it is an engineering document, not a legal filing. A lawyer or your data protection officer / advisor has the final word on whether it is complete for your situation.

**Applicable law:** _GDPR (EU/DE) · DSG (CH) · both — from `.ai-eng-kit` → `law`; the rules are in `docs/law/`_
**Data protection stance:** _lean | standard | strict — set in `docs/PRD.md` → Constraints_
**Controller (Verantwortlicher):** _your company / your name and address — the legal entity behind the product_
**Last reviewed:** _YYYY-MM-DD_

---

## Processing activities

_One row per purpose, not per table. "Run user accounts" is a purpose; "the profiles table" is not._

| Purpose | Data | Whose | Why it is lawful | Retention | Processors involved |
|---------|------|-------|------------------|-----------|---------------------|
| _Run user accounts_ | _Email, password hash, display name_ | _Registered users_ | _GDPR: Art. 6(1)(b) contract · DSG: expected purpose, no justification needed_ | _Until account deletion_ | _Supabase (EU)_ |
| _..._ | _..._ | _..._ | _..._ | _..._ | _..._ |

## Sensitive data

_Health, biometrics, genetics, ethnicity, political opinion, religion, trade union membership, sex life or orientation, criminal matters — and, under the Swiss DSG, social-assistance measures and administrative proceedings (Art. 9 GDPR · Art. 5 lit. c DSG). These carry much stricter rules — usually explicit consent. List them separately so nobody overlooks them, or write "none"._

- _none_

## Processors (Auftragsverarbeiter · Auftragsbearbeiter)

_Every external service that touches personal data on your behalf (Art. 28 GDPR · Art. 9 DSG). Each needs a data processing agreement (AVV / DPA) — normally a checkbox or a downloadable document in the provider's dashboard. Under the DSG the countries you export to also have to be named in the privacy policy._

| Service | What it processes | Region | DPA signed | Outside the adequate countries? |
|---------|-------------------|--------|------------------|----------------|
| _Supabase_ | _All application data_ | _eu-central-1 (Frankfurt)_ | _☐_ | _US company, EU hosting_ |
| _Vercel_ | _Requests, logs_ | _..._ | _☐_ | _..._ |
| _Sentry_ | _Error reports (scrubbed)_ | _..._ | _☐_ | _..._ |

## Data subject rights — how they are served

_Which part of the app actually delivers each right. "By email, manually" is a valid answer for a small product; leaving it blank is not._

| Right | GDPR | DSG | How this product delivers it |
|-------|------|-----|------------------------------|
| Access / copy | Art. 15 | Art. 25 | _..._ |
| Rectification | Art. 16 | Art. 32 | _..._ |
| Erasure | Art. 17 | Art. 32 / Art. 6 Abs. 4 | _..._ |
| Portability | Art. 20 | Art. 28 (narrower) | _..._ |
| Objection | Art. 21 | Art. 30 Abs. 2 | _..._ |

> Deadline: **one calendar month** under the GDPR (Art. 12(3), extendable by two for complex cases if the person is told within the first), **30 days** under the DSG (Art. 25 Abs. 7).

## Open points

_What is still unresolved, and who resolves it. `/dsgvo` adds items here; they leave when they are actually done._

- [ ] _e.g. AVV with Sentry not yet signed_
- [ ] _e.g. Retention period for uploaded files never decided_

## For a lawyer / data protection officer or advisor

_Questions that need a human. Keep the context with each question so it can be asked without re-explaining the product._

- _e.g. Our free tier keeps analytics data for 24 months on legitimate interest — is that defensible for a B2C product with no login requirement?_

---

_Run `/dsgvo` to create the first version of this record, and again whenever a feature changes what personal data the product holds._
