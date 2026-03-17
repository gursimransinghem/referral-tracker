# Referral Tracker — Project Status

## Current State: Advanced Version Built ✅

**Live preview:** https://gursimransinghem.github.io/referral-tracker/
**Repository:** https://github.com/gursimransinghem/referral-tracker

---

## What's Done

- [x] Complete system architecture designed
- [x] Polished HTML overview (13 sections, mobile-responsive, dark theme)
- [x] Simple Base Google Apps Script code (apps-script.gs — 733 lines)
- [x] iPhone Shortcut setup guide (3 options: auto, manual, hybrid)
- [x] Test webhook script (4 test scenarios)
- [x] Setup guide (SETUP-GUIDE.md — step-by-step for non-developers)
- [x] Advanced Google Apps Script code (apps-script-advanced.gs — 1,184 lines)
- [x] 6-expert panel review (Marketing, Patient Relations, CEO, Financial, Office Manager, HIPAA)
- [x] GitHub Pages live + shareable link working
- [x] Annotated flow diagram with side-by-side context notes
- [x] Dual workflow examples (detailed referral + sparse/minimal referral)
- [x] Tier system revenue explanation with dollar amounts
- [x] 30-minute humanistic auto-reply design
- [x] iPhone Shortcut trigger explanation (keyword + sender modes)

## What's Next (To-Do)

### Waiting on Friend's Answers
- [ ] Send friend the 16 questions (Section 11 of the overview)
- [ ] Get 3-4 real referral text samples (most critical input)
- [ ] Confirm assignment model (round-robin vs. team-wide)
- [ ] Confirm scheduling system (Google Calendar, EHR, etc.)
- [ ] Confirm clinic locations + zip codes

### After Answers Received
- [ ] Build **Simple Base** final version (production-ready code)
  - [ ] AI extraction (name, phone, email, complaint, diagnosis, injury, zip)
  - [ ] Google Sheet logging with checkboxes + auto-timestamps
  - [ ] WhatsApp team notification with pending count
  - [ ] Twice-daily stale check (flat 24h window)
  - [ ] Welcome email to patient
  - [ ] Claimed By column (prevents duplicate calls)
  - [ ] Status dropdown (No Answer / Left VM / Scheduling / Booked / Declined)
  - [ ] Attempt counter + follow-up date column

- [ ] Build **Advanced** version (all Simple features plus)
  - [ ] Tier system (🔴🟠🟡⚪) with per-tier SLAs
  - [ ] 30-minute humanistic auto-reply to referral source
  - [ ] Insurance detection & flagging
  - [ ] Zip/area code → nearest clinic matching
  - [ ] Calendar integration → available appointment slots
  - [ ] Tier-aware stale alerts (T1 alerts faster than T3)
  - [ ] Missing info flagging in WhatsApp messages
  - [ ] Owner escalation for severely overdue T1s
  - [ ] Duplicate detection (phone number match against last 90 days)
  - [ ] Dollar estimates on stale alerts ("$45K aging past SLA")

### Future Features (Backlog — Float to Friend Later)
- [ ] Weekly scorecard (Monday summary with team stats)
- [ ] Auto-reassignment (missed SLA → forward to next team member)
- [ ] Referral source leaderboard
- [ ] Conversion funnel tracking (referral → called → booked → showed → treated)
- [ ] No-show/cancellation follow-up trigger
- [ ] Post-visit feedback text ("How was your visit? Reply 1-5")
- [ ] Post-appointment Google Review request
- [ ] Spanish-language patient touchpoints
- [ ] Intake form auto-send after booking
- [ ] Monthly report PDF generation
- [ ] Referral source follow-up loop ("Your patient is scheduled for [date]")

## Files

| File | Purpose |
|------|---------|
| `index.html` | Live GitHub Pages overview (the shareable link) |
| `SETUP-GUIDE.md` | Step-by-step setup for non-developers |
| `apps-script.gs` | Simple Base Google Apps Script (production code) |
| `apps-script-advanced.gs` | Advanced Google Apps Script (full feature set, 1,184 lines) |
| `shortcut-steps.md` | iPhone Shortcut detailed setup |
| `test-webhook.sh` | Curl test commands |
| `docs/COMPLETE-PLAN.md` | Full markdown version of the plan |
| `docs/COMPLETE-PLAN.html` | HTML version (synced with index.html) |
| `docs/EXPERT-REVIEW.md` | 6-expert panel review with scores + recommendations |
| `STATUS.md` | This file |

## Expert Panel Scores

| Expert | Score | Key Gap |
|--------|:-----:|---------|
| Marketing Director | 8/10 | Needs referral source relationship layer |
| Patient Relations | 6.5/10 | Welcome email needs empathy/warmth |
| Practice CEO | 7/10 | Needs fallback for system failures + scale plan |
| Financial Advisor | 8/10 | Needs conversion funnel for revenue visibility |
| Office Manager | 7/10 | Needs Claimed By column + status dropdown |
| HIPAA Compliance | 1/10 | Not a blocker (referral consent pre-obtained) — harden later |

## Costs

| Version | Monthly (50-100 refs) |
|---------|:--------------------:|
| Simple Base | $8-20/month |
| Advanced | $15-30/month |
