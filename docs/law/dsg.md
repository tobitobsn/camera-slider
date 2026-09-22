# Swiss DSG (revDSG / nFADP) — the concrete rules

> **Applies when `.ai-eng-kit` → `law` includes `dsg`** — the product is offered to people in
> Switzerland, or the controller sits there. If `dsg` is not recorded, this file does not describe this
> project's obligations. When more than one law is recorded, `/dsgvo` applies the stricter form of
> each duty — a Swiss product with EU customers usually falls under the GDPR as well (Art. 3(2) GDPR).
>
> This is an engineering reference, not legal advice. Written 2026-08-21 against the revised Federal Act
> on Data Protection (FADP / DSG, in force since 1 September 2023) and the DSV ordinance; ZGB pointer
> for Urteilsfähigkeit corrected 2026-09-07.
> **Review status: drafted from the statute; not yet reviewed by a Swiss data protection advisor.**
> Treat its article numbers as pointers to check, not as settled findings.

The *workflow* — which data, which duties, how they become acceptance criteria — lives in `/dsgvo`
and is the same under every law. This file holds what the Swiss DSG in particular requires and calls
things, and **where it differs from the GDPR**, because a German-trained instinct gets several of
these wrong.

---

## Vocabulary

_Reached from `/dsgvo` throughout — Swiss German uses different words, and the documents should too._

| English | Swiss German (use alongside) | Meaning |
|---|---|---|
| controller | **Verantwortlicher** | same as under the GDPR |
| processor | **Auftragsbearbeiter** (not Auftragsverarbeiter) | a service processing data on the controller's behalf (Art. 9 DSG) |
| processing | **Bearbeitung** (not Verarbeitung) | the DSG's term throughout |
| sensitive personal data | **besonders schützenswerte Personendaten** | Art. 5 lit. c DSG — the list is wider than Art. 9 GDPR |
| data protection advisor | **Datenschutzberater/in** | Art. 10 DSG — **voluntary** for private controllers |
| supervisory authority | **EDÖB** — Eidgenössischer Datenschutz- und Öffentlichkeitsbeauftragter (FDPIC) | one federal authority, not one per canton |
| data protection impact assessment | **Datenschutz-Folgenabschätzung** | Art. 22 DSG |
| privacy policy | **Datenschutzerklärung** | Art. 19 DSG information duty |
| breach | **Verletzung der Datensicherheit** | Art. 24 DSG |

Never describe the app as *compliant*, *DSG-konform*, *rechtssicher* — the boundary in `/dsgvo` applies.

## Lawfulness — the DSG has no "legal basis" requirement

_Reached from `/dsgvo` step 3. **This is the biggest difference to the GDPR.**_

Under the DSG, processing personal data is **permitted by default**. It becomes unlawful when it
violates the data subject's personality (Art. 30 DSG) — typically by processing against the stated
purpose, against the principles of Art. 6 (lawfulness, good faith, proportionality, purpose limitation,
accuracy, security), against an express objection, or by disclosing sensitive data to third parties.
A **justification** (Art. 31: consent, an overriding private or public interest, or a legal provision)
is needed only *for* such a violation — not for every processing operation.

So for each purpose, do not ask "which Art. 6 basis?" Ask instead:

1. **Is it what the person would reasonably expect** from the stated purpose and the privacy policy (Art. 6 Abs. 3)? If yes, no justification is needed.
2. **Does it touch sensitive data, high-risk profiling, or disclosure to third parties** in a way the person would not expect? Then a justification is needed — and for sensitive data and high-risk profiling by private persons, consent must be **express** (Art. 6 Abs. 7).
3. **Was an objection made?** An express objection makes further processing a violation unless justified.

Consent, where it is the justification, must be informed and freely given (Art. 6 Abs. 6), and it is
withdrawable. Pre-ticked boxes are not express consent.

Classic mistakes: importing the GDPR consent banner reflexively (see cookies below), and the opposite
— assuming "permitted by default" means "anything goes" with sensitive data.

## Sensitive data and protected groups

_Reached from `/dsgvo` step 2._

- **Sensitive personal data (Art. 5 lit. c DSG)** — religious, philosophical, political or trade-union views and activities; health; the intimate sphere; racial or ethnic origin; genetic data; biometric data that uniquely identifies a person; **administrative and criminal proceedings and sanctions**; **social assistance measures**. Wider than Art. 9 GDPR — the last two are Swiss additions, and criminal data is *inside* the list rather than a separate article.
- **High-risk profiling (Art. 5 lit. g)** — automated evaluation that allows assessing essential aspects of a person's personality. By private controllers it needs express consent where consent is the justification.
- **Personality profiles** as a legal term are gone; the protection moved to high-risk profiling.
- **Children** — no fixed age of digital consent in the DSG; capacity of judgement (Urteilsfähigkeit, Art. 16 ZGB) decides. A product aimed at minors still needs a plan.

## Duties and their articles

_Reached from `/dsgvo` step 4 — the article to cite beside each proposed acceptance criterion._

| Duty | DSG | What the AC usually says |
|---|---|---|
| Information | Art. 19–21 | inform at collection: identity and contact of the controller, purposes, recipients or categories of recipients, **and the countries data is exported to** (Art. 19 Abs. 4); a privacy policy reachable from every page |
| Access | Art. 25 | what is stored, purpose, retention, origin, recipients — answered **within 30 days** (Art. 25 Abs. 7), free of charge as a rule |
| Portability | Art. 28 | in a common electronic format — but **only** for data processed automatically **and** with consent or for a contract; narrower than Art. 20 GDPR |
| Rectification | Art. 32 Abs. 1 | the user can correct their data |
| Erasure | Art. 32 Abs. 2 (with Art. 28 ff. ZGB) | no "right to be forgotten" article — deletion is a remedy against unlawful processing and a consequence of purpose limitation (Art. 6 Abs. 4): data is deleted or anonymised once no longer needed |
| Objection | Art. 30 Abs. 2 lit. b | an express objection has to be honoured unless justified |
| Privacy by design / by default | **Art. 7** | explicit in the statute: defaults to the least data, strictest visibility |
| Data minimisation / proportionality | Art. 6 Abs. 2 | every field justified by its purpose |
| Security | Art. 8, DSV Art. 1–6 | technical and organisational measures appropriate to the risk; the ordinance names logging and a processing regulation for larger-scale sensitive processing |
| Record of processing | Art. 12 | **exempt below 250 employees** unless sensitive data at scale or high-risk profiling |
| Breach notification | **Art. 24** | to the EDÖB **"as soon as possible"** — no 72-hour rule — and only where a **high risk** to the people affected is likely; inform them where needed for their protection |
| Representative in Switzerland | Art. 14 | foreign controllers offering to people in Switzerland at scale, with regular monitoring and high risk, designate a representative — relevant for a **German** product with Swiss customers |
| Automated individual decisions | Art. 21 | inform the person; allow a human review on request |

**AC example, both languages** — English: "Given a user in Switzerland, when they sign up, then the privacy policy names the controller, the purposes, the recipients and the countries their data is transferred to, and is reachable from every page." · Deutsch: "Angenommen eine Nutzerin in der Schweiz, wenn sie sich registriert, dann nennt die Datenschutzerklärung den Verantwortlichen, die Bearbeitungszwecke, die Empfänger und die Staaten, in die ihre Daten bekanntgegeben werden, und ist von jeder Seite erreichbar."

## Stack and launch specifics

_Reached from `/dsgvo` step 5 and `/deploy` step 5._

- **Where the data sits.** Switzerland or a country on the Federal Council's adequacy list (Annex 1 DSV) — **the EU/EEA and the UK are on it**, so a Frankfurt region is fine for a Swiss product.
- **Processors (Art. 9).** A contract or a legal provision; the processor may engage sub-processors **only with the controller's prior approval** — when a provider's standard terms name sub-processors, that approval is given by accepting them. The Swiss term is *Auftragsbearbeiter*; providers' "DPA" documents serve.
- **Cross-border disclosure (Art. 16–17).** To a country **not** on the adequacy list — the US in particular — a safeguard is needed: the **Swiss-US Data Privacy Framework** (since September 2024) for self-certified US providers, otherwise standard contractual clauses approved by the EDÖB. And the countries of export have to be **named in the privacy policy** (Art. 19 Abs. 4) — a duty the GDPR does not state that way.
- **Cookies, analytics, pixels — information plus opt-out is enough.** Art. 45c FMG requires informing the user and offering a way to refuse; **no prior consent banner** is required by Swiss law for ordinary analytics. When `gdpr` is *also* recorded, consent-before-loading satisfies both — apply that.
- **Legal notice.** No Impressum obligation in the German sense. E-commerce sites must state identity and contact details (**UWG Art. 3 Abs. 1 lit. s**) and a **Datenschutzerklärung** is required by Art. 19. Both are pre-launch items; the user needs a lawyer or a reputable generator, not you.
- **Error tracking** captures request data, which regularly includes personal data; scrubbing must be switched on deliberately (`docs/production/error-tracking.md`).

## DPIA threshold (Art. 22–23)

_Reached from `/dsgvo` step 6._

Do not write one; say whether it is likely required, and what triggers it:

- processing likely to result in a **high risk** to the personality or fundamental rights — in particular extensive processing of sensitive data, or systematic extensive monitoring of public areas
- high-risk profiling
- new technologies at scale

There is **no official blacklist** as under the GDPR. If a high risk remains after the planned
measures, the controller must **consult the EDÖB** beforehand (Art. 23) — unless a data protection
advisor has been consulted instead (Art. 23 Abs. 4). None of the triggers → say so plainly.

## Swiss specifics worth knowing

- **Fines are imposed on the responsible natural person, not the company** — up to **CHF 250,000** (Art. 60–63), on complaint, for intentional violations of information, access, cooperation and security duties. For a product manager that is personal exposure, which is why the information duties deserve attention.
- Commercial retention: **10 years** for business records (Art. 958f OR) — beats deletion for the affected records, and the user must be told.
- The **data protection advisor is voluntary** for private controllers (Art. 10); appointing one brings relief from the EDÖB consultation duty (Art. 23 Abs. 4).
- The EDÖB is one federal authority; there are no cantonal authorities for private controllers.
- A Swiss controller selling into the EU needs the GDPR too — and may need an **EU representative** (Art. 27 GDPR). Record both laws when that is the case.
