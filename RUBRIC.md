# Kargo Hiring Rubric v2

**Roles:** Product Manager (PM), Senior Product Manager (SPM)
**Purpose:** Score each applicant CV and produce a ranked shortlist with rationale.
**The system recommends. Arjun decides.** No candidate email is sent until Arjun clicks Send for that candidate.

> **Where this comes from.** v2 keeps the structure of the rubric we were given: six weighted criteria, an
> (a)+(b) gate at 15/45, Advance ≥70 / Hold 40–69 or gated / Decline <40, and three calibration scores.
> The source didn't include weights for (c)–(f) or level definitions, so **those are ours**. We chose them to reproduce
> the three documented scores exactly (see §6 and `tests/rubric.test.ts`). v1, built from Arjun's 8 past hires, is kept
> in the git history and fed into the level definitions below.

## 1. How a CV is scored

1. The CV text is extracted and **anonymised**. Name, contact details, gender, age, college and hometown are removed,
   and employer brands become neutral descriptors. A code-level redaction pass then catches anything the model missed.
2. The scoring model sees **only the anonymised text**. It gives each criterion a **level 0–5** and quotes the CV
   line it is based on. Criterion (f) is scored separately for PM and for SPM.
3. **Code** does the rest: points = weight × level / 5, total (0–100), gate, band, and the probe questions.
4. Every quote is checked against the anonymised CV. If a quote can't be found, it's shown with a red flag.

Use only evidence written in the CV. If there is none, the level is 0 and the evidence is "no evidence in CV".

## 2. Criteria

| | Criterion | Weight | Question |
|---|---|---|---|
| (a) | Operational domain fluency | **25** | Has this person done operational work themselves, close to where goods physically move? |
| (b) | Zero-to-one ownership | **20** | Did they create something that didn't exist, on their own initiative, and own it end to end? |
| (c) | Shipped-and-measured outcomes | **15** | Did they ship, measure what happened, and act on the measurement? |
| (d) | Independent judgment | **15** | Did they make consequential calls with nobody above them, and live with the result? |
| (e) | Multiplier effect | **10** | Did their work make other people or teams better or faster? |
| (f) | Role-scope fit (per role) | **15** | How well does the career match the PM or SPM scope in the JD? |

### Level anchors (0–5)

**(a) Operational domain fluency**
- 5 = Did the operational work themselves in freight, logistics or supply chain (documentation, dispatch, customs, port/terminal work, carrier allocation and exceptions, warehouse) for a sustained period (~2+ years), with specifics
- 4 = Hands-on ops, but shorter, or in a comparable ops-heavy field (manufacturing floor, field ops, on-ground fulfilment), or commercial / client roles inside a port, terminal, forwarder or 3PL that personally handled live ops issues (berth allocation, detention, escalations)
- 3 = Adjacent: supply chain planning or analytics with daily exposure to live ops, or worked physically alongside ops teams
- 2 = Built products for operators with sustained direct contact (site visits, shadowing)
- 1 = Knows ops from a distance: integrations, dashboards, occasional interviews
- 0 = None

*Score closeness to operational work, not "worked at a freight company". Adjacent ops must be able to score well.*

**(b) Zero-to-one ownership**: something new to the organisation that others rely on
- 5 = New to the org ("first", "nobody had"), self-initiated from a pain they saw, **relied on by others, and changed a result** for customers, operations or the business
- 4 = New and became the team or company standard, but assigned or with no stated impact. A framework the whole team adopted that moved a customer or ops metric is at least a 4
- 3 = Internal process paperwork adopted by their own team (templates, rituals, review processes) whose only effect is on the team itself, or first owner of a new product area
- 2 = Tools built inside their own scope and mainly used by themselves (e.g. an internal monitoring dashboard), or a big contribution to someone else's new build
- 1 = Improvements to an existing product or process within assigned scope
- 0 = None

**(c) Shipped-and-measured outcomes**
*Any function counts: features, deals closed, accounts retained, migrations run. A post-mortem on their own miss that changed team practice counts as acting on the data.*

- 5 = Multiple shipped things with tracked metrics, **and** killed or changed something because of the data
- 4 = Shipped with specific numbers
- 3 = Shipped; outcomes vague
- 2 = Claims outcomes, no evidence of shipping or measuring
- 1 = Activities and responsibilities only
- 0 = None

**(d) Independent judgment**
- 5 = Consequential calls with no layer above (reports to the founder, sole owner, independent consultant), lived with the result, including owning a miss
- 4 = Sole owner of an area with real decision authority
- 3 = Clear ownership inside a structured team
- 2 = Owned tasks or a module while decisions sat with others (e.g. one of four PMs, roadmap reviewed by the CTO: this is a 2, not a 3)
- 1 = Executed others' decisions
- 0 = Supporting role only

**(e) Multiplier effect**
- 5 = Created something that became a standard beyond their own team
- 4 = Became their own team's standard
- 3 = Specific enabling of others (onboarding, mentoring, docs others used)
- 2 = Generic collaboration
- 1 = Mentions teamwork only
- 0 = None

**(f) Role-scope fit.** Scored for **both** roles.
- **PM core:** 2–4 yrs PM (or PM plus product ownership inside an ops role); ships **and** kills or iterates in short cycles; builds without structure at an early-stage company; curious about ground-level ops.
- **SPM core:** 5–8 yrs PM, owned an area with no senior PM above; platform, integration or data layers, or complex existing technical environments; early-stage or "rules not written yet" experience.
- **Both:** in-office in Mumbai. Being Mumbai-based or willing to relocate is a plus; if it isn't stated, there's **no penalty**.
- 5 = meets every core requirement · 4 = most, one minor gap · 3 = partial · 2 = significant gaps · 1 = mostly off-profile · 0 = unrelated

## 3. Gate and bands

- **Gate:** if (a) + (b) is **below 15 of 45 points**, the candidate is flagged **gated** and cannot Advance, whatever the total.
  A gated candidate can still be a Decline.
- **Bands:** **Advance ≥ 70** · **Hold 40–69, or gated** · **Decline < 40**

> Note: with these weights, a gated candidate's maximum total is 14 + 55 = 69, so the gate can't change the band on
> its own. It works as a visible flag ("no ops fluency or 0→1 evidence") and becomes a hard cap if the weights are ever
> changed. `bandFor()` enforces the cap either way.

## 4. Zero-weight signals (never scored, never mentioned as strengths)

College or MBA brand, grades, medals · certifications · conference talks, community memberships · employer brand or company
size · lists of tools or frameworks. CV polish is not fit.

## 5. Bias guardrails

- Name, gender, age, marital status, religion, caste, college, hometown and photo are removed **before** scoring. The scorer never sees them.
- Career breaks and non-linear paths aren't penalised.
- (a) gives adjacent operations real credit, so the rubric isn't a "freight companies only" filter.
- Every level must quote the CV, and quotes are checked automatically.
- Rejection emails name nobody (not the candidate, not Arjun, not any staff member), blame no individual and never mention scores.

## 6. Calibration (run before scoring applicants)

Score the 8 past-hire CVs **as PM**, either on the `/calibration` page or with `npm run calibrate -- ./hires`.

| Hire | Outcome | Target |
|---|---|---|
| Lavanya Iyer | Exceeds | **98**, Advance (e.g. levels 5 5 5 5 4 5) |
| Vikram Nair | Meets | **46**, Hold (e.g. 0 3 4 2 4 3 = 47, which is gated) |
| Preetham Rao | Below | **41**, Hold, **gated** (e.g. 1 2 4 3 2 1) |
| Rohan, Sunita, Aditya, Meghna | Exceeds | Advance |
| Rahul Bose | Meets | Not Advance |

Scores with a documented target must land within **±5**. **Pass condition:** all 8 rows pass. If any fail, fix
`lib/prompts.ts` before scoring real applicants.

## 7. Interview probes (the two weakest criteria for the target role)

- (a) "Walk me through a freight forwarder's worst morning. What breaks first, and who feels it?"
- (b) "Tell me about something you built from nothing that nobody asked for. Who uses it now?"
- (c) "Pick one thing you shipped. What number moved, how did you measure it, and what did you kill or change because of the data?"
- (d) "What's a call you made with nobody above you to check it? How did it go, and what would you do differently?"
- (e) "What's something you created that other people or teams now work from? How did it spread?"
- (f) "This role owns the roadmap with no PM layer above you. Which part of that scope have you already done, and which part would be new?"

## 8. Known limits

- The weights for (c)–(f) and all level definitions are our own, fitted to three documented scores. Whether they rank
  real applicants the way Arjun would is the real test. Review the first batch together.
- CV-only. Interview and outcome notes should refine (c)–(e) in a later version.
