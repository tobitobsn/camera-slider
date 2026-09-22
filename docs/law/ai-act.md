# EU AI Act — the concrete rules for a product that ships AI features

> **Applies when `.ai-eng-kit` → `law` includes `ai-act`** — the product integrates AI (an LLM API,
> a recommendation model, image generation, anything that produces or decides with a model) **and**
> is offered to people in the EU. It travels with `gdpr`, not instead of it: AI features that touch
> personal data carry both. If `ai-act` is not recorded, this file does not describe this project's
> obligations.
>
> This is an engineering reference, not legal advice. Written 2026-08-25 against the AI Act
> (Regulation (EU) 2024/1689) as its obligations phase in (prohibitions since 2025-02-02, GPAI since
> 2025-08-02, transparency (Art. 50) and most remaining duties since 2026-08-02 — dates corrected
> 2026-09-07 against Art. 113); **not yet reviewed by a
> lawyer specialising in the AI Act** — a project betting real exposure on a verdict here confirms
> it with counsel first.

The *workflow* — how a duty becomes an acceptance criterion — lives in `/dsgvo` and is the same under
every law. This file holds what the AI Act in particular requires and calls things. The order of the
sections is the order to check them: each one can end the assessment early.

---

## Vocabulary

| English | German (use alongside) | Meaning |
|---|---|---|
| AI system | **KI-System** | software that infers from input how to generate output (predictions, content, decisions) — an LLM call in your app counts |
| provider | **Anbieter** | who develops an AI system (or has it developed) and places it on the market under their own name |
| deployer | **Betreiber** | who uses an AI system under their own authority — the typical role of a product that calls a model API |
| general-purpose AI (GPAI) | **KI-Modell mit allgemeinem Verwendungszweck** | the underlying model (Claude, GPT, Gemini); its provider carries its own obligations, not you |
| high-risk AI system | **Hochrisiko-KI-System** | a system used in an Annex III area — the heavy end of the Act |
| transparency obligations | **Transparenzpflichten** | Art. 50 — the duties that hit ordinary products |

Never describe the app as *AI-Act-compliant*, *konform*, or *rechtssicher* — the boundary in `/dsgvo`
applies here unchanged.

## 1. Prohibited practices (Art. 5) — check first, it ends everything

**In force since 2025-02-02. Fines up to €35M or 7% of worldwide turnover.** If a feature does one of
these, it cannot ship in the EU — the finding is a stop, not a task:

- subliminal or purposefully manipulative techniques that materially distort behaviour and cause harm
- exploiting vulnerabilities of age, disability, or social/economic situation
- social scoring (rating people across contexts with detrimental treatment)
- predicting criminal behaviour from profiling or personality traits alone
- untargeted scraping of facial images to build recognition databases
- **emotion recognition in the workplace or in education** (medical/safety exceptions aside)
- biometric categorisation to infer race, political opinions, union membership, beliefs, sex life or orientation
- real-time remote biometric identification in public spaces for law enforcement

Most products never come near these. The two that show up in ordinary SaaS ideas anyway: *emotion
recognition on employees* ("detect frustration in support agents") and *social scoring* ("trust score
across unrelated behaviour"). Name it plainly when a spec drifts there.

## 2. High-risk check (Art. 6 + Annex III) — decides how heavy this gets

A system is high-risk when it is used in one of these areas **and materially influences the outcome**:

1. biometric identification or categorisation
2. critical infrastructure (safety components)
3. **education** — admission, evaluation, proctoring
4. **employment** — recruitment, screening applications, promotion/termination decisions, task allocation by monitoring
5. **essential services** — creditworthiness/credit scoring, insurance pricing (life/health), emergency dispatch, public benefits
6. law enforcement · 7. migration and border control · 8. justice and democratic processes

The carve-out (Art. 6(3)): a system in these areas that only performs a **narrow procedural task**,
improves the result of a completed human activity, or does preparatory work may fall out of high-risk —
**but never when it profiles natural persons**. Treat the carve-out as a lawyer's call, not yours.

**What high-risk means for this kit's users:** the full provider/deployer machinery — risk management,
data governance, logging, human oversight, conformity assessment, CE marking. That is beyond an
engineering checklist. The honest output of `/dsgvo` here is: *this feature is in Annex III territory —
stop, get counsel before building it*, recorded as a blocking Open Question in the spec. An AI feature
that merely assists inside such a product (drafts a text a human reviews and sends) is usually not the
high-risk system itself — say which side of that line the feature is on, and why.

## 3. Which role does the product play? (Art. 25)

- **Calling a model API (Claude, OpenAI, Gemini) inside your product → you are a deployer** of that
  model and the **provider of your own AI system** (your feature) in the everyday sense — but the heavy
  *provider* obligations of the Act attach to high-risk systems and to the GPAI model's own provider,
  not to an ordinary limited-risk feature.
- **The line moves** when you fine-tune a model and offer it onward, put your own name on a
  general-purpose model, or substantially modify a high-risk system — then provider duties can land on
  you (Art. 25). That step deserves counsel before it happens, not after.
- **The GPAI provider's duties (Art. 53/55 — training-data summaries, model evaluations, systemic-risk
  testing) are the model vendor's, not yours.** What is yours: pick a vendor that meets them, and keep
  the vendor's documentation (model card, API terms) referenced in `docs/privacy.md`'s processor list.

## 4. Transparency (Art. 50) — the duties that apply to almost every AI feature

**Apply since 2026-08-02 (Art. 113).** These are the ones to turn into acceptance criteria, because they are
user-visible behaviour:

| Duty | When | As an acceptance criterion |
|---|---|---|
| Disclose AI interaction — Art. 50(1) | chatbots, AI agents, voice assistants | the UI states the user is interacting with an AI, at first contact, unless it is obvious from context |
| Mark synthetic content — Art. 50(2) | the product generates audio, image, video or text | generated output is marked as AI-generated in a machine-readable way where technically feasible |
| Disclose emotion recognition / biometric categorisation — Art. 50(3) | the (non-prohibited) cases | the affected person is informed before it runs |
| Disclose deepfakes and AI-written public-interest text — Art. 50(4) | realistic image/audio/video of real people or events; AI-generated text published to inform the public | the content is visibly declared as artificially generated |

The common case for kit users is the first row: an AI chat, an AI assistant in the product. One AC —
the disclosure is present, worded plainly, shown before or at the first AI interaction — closes it.

## 5. The GDPR interface — AI does not suspend data protection

When personal data flows into a model (a prompt containing a user's text, a support ticket, a profile):

- the processing needs its **legal basis per purpose** like any other (`docs/law/gdpr.md` → Lawfulness),
  and "training" is a separate purpose from "answering this request" — check what the vendor's API terms
  say about training on your data, and prefer the setting that excludes it
- the model vendor is a **processor**: DPA required, listed in `docs/privacy.md`, transfer rules apply
  when the API runs outside the EU (SCCs / adequacy — same mechanics as any US service)
- the **privacy policy names the AI processing** — what goes to the model, to whom, for what
- a DPIA (`gdpr.md` → DPIA) becomes likely when AI processes sensitive data at scale or systematically
  evaluates people — and an existing DPIA is reusable groundwork if the feature ever needs a
  fundamental-rights impact assessment

## 6. AI literacy (Art. 4)

Since 2025-02-02, whoever operates AI systems has to ensure the people using them have adequate AI
literacy. For a small team this is not a training department: a short internal note — what the AI
feature does, what it must not be used for, where its output needs a human check — satisfies the spirit
and is worth one line in the project docs. Mention it once; do not build a compliance theatre around it.
