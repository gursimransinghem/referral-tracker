# Referral Tracker — Complete System Overview
### Built for a Pain Management Practice

**The problem:** Referrals come in via text, get copy-pasted into a WhatsApp group, team members miss them, patients fall through the cracks, business is lost, nobody's accountable.

**The solution:** A system that catches every referral the moment it arrives, has AI extract and organize the patient info, routes it to your team with priority level and nearby appointment options ready to go, and barks at everyone twice a day if anything's been sitting too long.

**Once it's set up, you do nothing.** Referrals flow in, get processed, and your team gets actionable WhatsApp messages. You just watch the Google Sheet fill up with checkmarks.

---

## Table of Contents

1. [System Overview — How It Works](#1-system-overview)
2. [The Workflow — Step by Step](#2-the-workflow)
3. [What Your Team Sees (WhatsApp Message Formats)](#3-what-your-team-sees)
4. [The Tier System — Patient Priority Levels](#4-the-tier-system)
5. [What "Stale" Means & Why It Matters](#5-what-stale-means)
6. [The AI — What It Does Behind the Scenes](#6-the-ai)
7. [Auto-Reply to Referral Sources](#7-auto-reply)
8. [Welcome Email to Patients](#8-welcome-email)
9. [The Google Sheet — Your Live Dashboard](#9-the-google-sheet)
10. [Two Versions: Simple Base vs. Advanced](#10-two-versions)
11. [Questions We Need Answered](#11-questions)
12. [Future Feature Ideas](#12-future-features)
13. [Cost Breakdown](#13-costs)

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        YOUR iPHONE                                  │
│                                                                     │
│   Someone texts you a referral (like they always have)              │
│                          │                                          │
│                          ▼                                          │
│   ┌──────────────────────────────────┐                              │
│   │  iPhone Shortcut (runs silently) │                              │
│   │  Detects: keyword "referral"     │                              │
│   │  OR message from known senders   │                              │
│   └──────────────┬───────────────────┘                              │
│                  │                                                   │
└──────────────────┼───────────────────────────────────────────────────┘
                   │ Sends raw text to your webhook
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    GOOGLE APPS SCRIPT (free, runs in cloud)          │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────┐       │
│   │                    CLAUDE AI                             │       │
│   │                                                         │       │
│   │  1. Is this actually a referral? (filters junk)         │       │
│   │  2. Extract: name, phone, email, complaint, diagnosis   │       │
│   │  3. Classify injury type (MVA, PI, workers comp, etc.)  │       │
│   │  4. Assign priority tier (🔴 T1 → ⚪ T4)               │       │
│   │  5. Flag missing info                                   │       │
│   │  6. Detect insurance if mentioned                       │       │
│   └───────────────────────┬─────────────────────────────────┘       │
│                           │                                         │
│   ┌───────────────────────▼─────────────────────────────────┐       │
│   │               FIVE THINGS HAPPEN AT ONCE                 │       │
│   │                                                         │       │
│   │  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌─────┐ ┌─────┐ │       │
│   │  │ Log to  │ │ WhatsApp │ │ Welcome │ │Auto-│ │Zip/ │ │       │
│   │  │ Google  │ │ blast to │ │ email   │ │reply│ │area │ │       │
│   │  │ Sheet   │ │ team     │ │ to pt   │ │to   │ │code │ │       │
│   │  │         │ │          │ │ (if     │ │ref  │ │→    │ │       │
│   │  │ (your   │ │ (with    │ │ email   │ │src  │ │near-│ │       │
│   │  │ live    │ │ tier,    │ │ found)  │ │     │ │est  │ │       │
│   │  │ call    │ │ slots,   │ │         │ │     │ │clin-│ │       │
│   │  │ list)   │ │ pending  │ │         │ │     │ │ics  │ │       │
│   │  │         │ │ count)   │ │         │ │     │ │     │ │       │
│   │  └─────────┘ └──────────┘ └─────────┘ └─────┘ └─────┘ │       │
│   └─────────────────────────────────────────────────────────┘       │
│                                                                     │
│   ┌─────────────────────────────────────────────────────────┐       │
│   │              TWICE-DAILY HEARTBEAT (9 AM + 4 PM)         │       │
│   │                                                         │       │
│   │  Scans for overdue referrals based on each tier's SLA   │       │
│   │  Sends WhatsApp status report to entire team            │       │
│   │  Flags any stale referrals by name with time overdue    │       │
│   └─────────────────────────────────────────────────────────┘       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      YOUR TEAM'S WORKFLOW                            │
│                                                                     │
│   1. Receive WhatsApp notification with all info + appt slots       │
│   2. Open Google Sheet via link in message                          │
│   3. Call the patient — appointment options are right there          │
│   4. Check ☐ "Called" box → timestamp auto-fills                    │
│   5. Book the appointment                                           │
│   6. Check ☐ "Booked" box → timestamp auto-fills                   │
│   7. Done. Next referral.                                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**The key idea:** From the moment someone texts you a referral to the moment your team member has the patient on the phone with appointment options — zero manual work from you. The system handles the parsing, organizing, prioritizing, notifying, and nagging.

---

## 2. The Workflow — A Real Example

Let's walk through what happens when Dr. Ramirez texts you at 2:17 PM on a Tuesday:

> *"Hey got a referral for you. Maria Garcia 786-555-1234 maria.garcia@email.com car accident last Thursday, neck and back pain. She lives in Doral area 33178. Cervical strain, lumbar radiculopathy. Attorney is Smith & Associates. She needs to be seen ASAP."*

Here's exactly what happens, in order, in about 8 seconds:

### Second 1-2: iPhone Shortcut fires
Your phone receives the text. The Shortcut detects "referral" in the message and silently sends the entire text + sender info to your Google Apps Script webhook. You don't see or do anything.

### Second 3-5: AI analyzes the message
Claude reads the raw text and extracts:
- **Patient:** Maria Garcia
- **Phone:** (786) 555-1234
- **Email:** maria.garcia@email.com
- **Complaint:** Neck and lower back pain
- **Diagnosis:** Cervical strain, lumbar radiculopathy
- **Injury type:** Car Accident (MVA)
- **Zip:** 33178
- **Referral source:** Dr. Ramirez
- **Insurance:** Not mentioned (flagged as missing)
- **Priority:** 🔴 **T1 — URGENT** (recent MVA + attorney + "ASAP")

### Second 5-6: Google Sheet updated
A new row appears in your Referral Call List with all the extracted fields, checkboxes for Called/Booked, and the tier level. Referral ID: REF-0042.

### Second 6-7: Clinic matching + appointment slots
The system looks up zip code 33178, finds:
1. Doral clinic — 2.1 miles away
2. Hialeah clinic — 4.8 miles away

Then checks the calendar and finds available slots in the next 48 hours.

### Second 7-8: Three things fire simultaneously

**A) WhatsApp goes to your entire team** (see Section 3 for the exact format)

**B) Auto-reply texts back to Dr. Ramirez:**
> *"Got it — Maria Garcia is in our system. Team will call her within the hour. Thanks for the referral!"*

**C) Welcome email sent to maria.garcia@email.com** with your practice info, what to bring, and a booking link.

### Minutes later: Your team member calls
Sarah sees the WhatsApp, opens the Google Sheet link, sees Maria is 🔴 Urgent with 3 appointment options. She calls Maria: "Hi Maria, we have openings at our Doral location — Tuesday at 2 PM, Wednesday at 10:30 AM, or Thursday at 3 PM. Which works best?" Maria picks one. Sarah checks the Called ☐ and Booked ☐ boxes. Timestamps auto-fill. Done.

### If nobody calls within 1 hour (T1 SLA):
The next heartbeat check (or a tier-specific alert) fires a WhatsApp:
> *"🚨 OVERDUE: Maria Garcia (🔴 T1) — 1h 23m past SLA. Call immediately."*

---

## 3. What Your Team Sees (WhatsApp Message Formats)

Every WhatsApp message is structured intentionally. Here's why each piece is there:

### A) New Referral Notification

```
🔴 URGENT — NEW REFERRAL (#REF-0042)
   Call within 1 hour

👤 Maria Garcia
📞 (786) 555-1234
📧 maria.garcia@email.com
💬 Neck/back pain — MVA 5 days ago
🏷️ Car Accident | Cervical strain, lumbar radiculopathy
⚖️ Attorney: Smith & Associates
📍 33178

🏥 Nearest clinics:
   1. Doral — 2.1 mi
   2. Hialeah — 4.8 mi

📅 Next available (48h):
   • Tue 3/18 — 2:00 PM (Doral)
   • Wed 3/19 — 10:30 AM (Doral)
   • Wed 3/19 — 3:00 PM (Hialeah)

📋 Pending calls: 4 (2🔴 1🟠 1🟡)

🔗 [Google Sheet Link]
```

**Why it's structured this way:**

| Element | Why it's there |
|---------|---------------|
| 🔴 Color + "URGENT" at top | Instant visual priority — your team's eyes go here first. They know immediately if this can wait or not. |
| "Call within 1 hour" | Removes ambiguity. No one can say "I didn't know it was urgent." |
| Referral ID (#REF-0042) | Creates accountability. You can say "what happened with REF-0042?" and everyone knows exactly which patient. |
| Phone number prominently placed | The team member can tap it to call directly from WhatsApp. One tap. |
| Complaint + injury type | The team member knows what to say on the phone before they dial. No fumbling. |
| Attorney info | Signals urgency AND lets the team know there's legal involved (changes how they handle the case). |
| Nearest clinics with distance | The team member doesn't have to ask "which location is closest to you?" — they already know. |
| Available slots | **This is the killer feature.** The team member leads with options, not "when are you free?" The call takes 90 seconds instead of 5 minutes of back-and-forth. |
| Pending count with tier breakdown | Creates healthy pressure. "4 pending, 2 urgent" motivates action. |
| Google Sheet link | One tap to open the full call list. No searching, no bookmarks. |

### B) Morning Heartbeat (9:00 AM)

```
☀️ MORNING REFERRAL CHECK — Tue Mar 18

📊 Status:
   ✅ Called yesterday: 6
   📅 Booked yesterday: 4
   ⏳ Pending (not called): 5

🚨 OVERDUE (past SLA):
   🔴 Maria Garcia — (786) 555-1234
      MVA / neck & back pain
      Logged 16h ago (SLA: 1h) ⚠️
   🟠 James Wilson — (305) 555-6789
      Personal injury / knee pain
      Logged 8h ago (SLA: 4h) ⚠️

⏳ On track:
   🟡 Robert Chen — (954) 555-3456
      Chronic pain / lower back
      Logged 6h ago (SLA: 24h) ✓

⚪ Needs YOUR follow-up:
   • Unknown patient from +1(305)555-0199
     Referral missing phone # — text source back

📋 Total pending: 5
🔗 [Google Sheet Link]
```

**Why morning + afternoon:**
- **9 AM** catches anything that came in late yesterday or overnight. Your team starts the day knowing exactly what's waiting.
- **4 PM** is the "end of day" safety net. If something came in at 10 AM and nobody's called by 4 PM, this is the alarm bell. No referral survives two heartbeat checks without being noticed.

### C) Afternoon Heartbeat (4:00 PM)

```
🌆 AFTERNOON REFERRAL CHECK — Tue Mar 18

📊 Today so far:
   ✅ Called: 4
   📅 Booked: 3
   ⏳ Still pending: 2

🚨 OVERDUE:
   🟡 Robert Chen — (954) 555-3456
      Chronic pain / lower back
      Logged 16h ago — approaching SLA ⚠️

✅ All urgent/priority referrals handled today. Nice work.

🔗 [Google Sheet Link]
```

---

## 4. The Tier System — Patient Priority Levels

The AI automatically assigns a priority tier based on what's in the referral text. Your team never has to think about priority — they just see the color and the SLA.

| Tier | Label | Call Within | What Triggers It |
|------|-------|-------------|-----------------|
| 🔴 **T1** | URGENT | **1 hour** | Recent accident (< 7 days), ER discharge, attorney involved, "ASAP"/"urgent"/"emergency", patient in acute pain |
| 🟠 **T2** | PRIORITY | **4 hours** | Accident within 30 days, has imaging/diagnosis ready, complete referral info, insurance verified |
| 🟡 **T3** | STANDARD | **24 hours** | Chronic pain, no time pressure, vague complaint, older injury |
| ⚪ **T4** | NEEDS INFO | **24 hours** (but flags you) | Missing phone number, can't identify patient, referral too vague to act on |

**Why this matters for a pain management practice specifically:**

- **Recent MVA patients are the highest-value referrals.** They need care fast, and if your team waits, those patients find another practice — or their attorney sends them elsewhere. Every hour matters.
- **Attorney involvement always bumps to T1.** If a lawyer is already in the picture, that patient is being referred to multiple practices simultaneously. First to call wins.
- **T4 (Needs Info) protects you from losing referrals.** Instead of an incomplete referral sitting in a text thread forgotten, the system tells YOU specifically to follow up with the referral source. Nothing gets lost.

**The SLA (Service Level Agreement)** is just a fancy way of saying "the maximum time before someone should call this patient." The system tracks it automatically and alerts when it's breached.

---

## 5. What "Stale" Means & Why It Matters

A **stale referral** is one where the patient hasn't been called within the expected timeframe (the SLA for their tier).

**Why this is the #1 problem the system solves:**

Right now, referrals go into a WhatsApp group and... sit. Maybe Sarah saw it but figured Mike would handle it. Mike didn't check his phone for 3 hours. By the time someone calls, it's been 6 hours and the patient already booked with another doctor — or worse, they gave up on getting care.

**Stale = lost revenue.** Every stale referral is a patient who's getting colder by the hour. The system makes stale referrals impossible to ignore:

1. **Real-time:** Every new referral WhatsApp notification includes a count of currently stale referrals at the bottom. You can't see a new one without also seeing the ones you've been ignoring.

2. **9 AM heartbeat:** Stale referrals from yesterday are listed by name, phone number, and how long they've been waiting. Public accountability — everyone on the team sees the same list.

3. **4 PM heartbeat:** Last chance before end of day. If something went stale during the workday, this catches it.

4. **Escalation:** If a T1 (Urgent) referral goes more than 2x past its SLA, the owner (you) gets a direct personal alert, separate from the group. Something is wrong if an urgent referral has been sitting for 2+ hours.

**The system doesn't let anyone say "I didn't see it" or "I thought someone else was handling it."** Every message is timestamped, every SLA is explicit, and the heartbeat checks make avoidance impossible.

---

## 6. The AI — What It Does Behind the Scenes

The AI (Claude) is the engine that turns messy, inconsistent text messages into clean, structured, actionable data. Here's specifically what it does:

### Referral Detection
Not every text with the word "referral" is actually a patient referral. "Hey, are you coming to the conference? Bring those referral forms" is NOT a referral. The AI reads the full message and decides: is this a real patient referral, or something else? If it's not a referral, the system ignores it. No false alarms.

### Data Extraction
Referral texts are messy. They come in every format imaginable:
- "Got a pt for u maria garcia 786-555-1234 mva neck pain"
- "Referral: Patient Maria Garcia, DOB 03/15/1980, suffered injuries in a motor vehicle accident on 3/12..."
- "hey bro I have a patient, she was in an accident last week. her name is maria, number is 786 555 1234. neck and back. lives in doral"

The AI reads all of these and extracts the same structured output:
```
Name:        Maria Garcia
Phone:       (786) 555-1234
Complaint:   Neck and back pain
Injury Type: Car Accident (MVA)
Zip:         33178 (inferred from "Doral")
```

### Priority Classification
Based on keywords, timeframes, and context clues in the message, the AI assigns a tier (see Section 4). It picks up on signals like:
- "last week" → recent MVA → 🔴 T1
- "attorney" or "lawyer" → 🔴 T1
- "ASAP" or "urgent" → 🔴 T1
- "chronic" or "ongoing for months" → 🟡 T3
- Missing phone number → ⚪ T4

### Missing Info Detection
The AI knows what a complete referral looks like. If the phone number is missing, if there's no complaint, if the name is unclear — it flags exactly what's missing. This shows up in the WhatsApp message and the Google Sheet so the team knows they might need to dig for info before calling.

### Insurance Detection
If the referral mentions "GEICO," "State Farm," "Medicare," "Medicaid," "workers comp," or any insurance-related terms, the AI extracts it. This saves the team a question on the phone and may affect which clinic the patient should be routed to.

### Graceful Failure
If the AI can't parse the message for any reason — weird formatting, garbled text, system error — **it logs the referral anyway** with the raw text and marks it as "NEEDS REVIEW." Nothing is ever lost. The worst case is that a human has to read the original message and fill in the fields manually. That's the same amount of work as today, so there's no downside.

---

## 7. Auto-Reply to Referral Sources

After the AI processes a referral, the system automatically texts back the person who sent it:

> *"Got it — Maria Garcia is in our system. Our team will reach out to her within the hour. Thanks for the referral, Dr. Ramirez!"*

**Why this matters:**
- **Professionalism.** The referral source knows instantly that their referral was received and is being handled. Most practices don't do this.
- **Trust = more referrals.** When a referring doctor knows their patients are being contacted quickly, they send more patients your way. This is a relationship builder.
- **Closes the loop.** Without the auto-reply, referring doctors have no idea if you got their text, if you're going to act on it, or if their patient is going to fall through the cracks. That uncertainty makes them less likely to refer again.

The reply includes the patient name (so the source knows the right referral was captured) and the expected timeframe (based on the tier).

---

## 8. Welcome Email to Patients

When the AI detects an email address in the referral, the patient receives a professional welcome email within seconds. This includes:

- Greeting using their first name
- Confirmation that the practice received their referral
- What to expect at the first visit
- Specialties offered (MVA, personal injury, chronic pain, etc.)
- **A direct booking link** (if the practice has online scheduling)
- What to bring: photo ID, insurance cards, imaging, police report, medication list, attorney info
- Practice contact info and address

**Why this matters:**
- The patient hears from your practice before your team even calls. That's impressive.
- If the patient is motivated, they can book online themselves — the appointment happens with zero staff involvement.
- It sets expectations and reduces no-shows (patients who know what to bring show up prepared).

---

## 9. The Google Sheet — Your Live Dashboard

The Google Sheet is the central hub. It's not just a log — it's an active call list your team works from daily.

### Columns:

| Column | What It Shows |
|--------|--------------|
| Referral ID | REF-0001, REF-0002, etc. — unique identifier |
| Logged At | When the system received the referral |
| Tier | 🔴🟠🟡⚪ — priority level |
| Patient Name | Extracted by AI |
| Phone | Extracted, formatted, tap-to-call on mobile |
| Email | Extracted if available |
| Complaint | What's wrong (in plain language) |
| Diagnosis | Medical diagnosis if provided |
| Injury Type | Car Accident / Personal Injury / Workers Comp / etc. |
| Insurance | If detected in the referral text |
| Zip Code | Patient location |
| Nearest Clinic | Auto-matched by zip/area code |
| Referral Source | Who sent the referral |
| Called ☐ | **Checkbox** — team member clicks when they call |
| Called At | **Auto-fills** when the checkbox is clicked |
| Called By | Team member name (can be manual or auto if using assignment) |
| Booked ☐ | **Checkbox** — clicked when appointment is confirmed |
| Booked At | **Auto-fills** when the checkbox is clicked |
| Notes | Free text for anything the team wants to add |

**Key features:**
- **Sort by tier** to always work urgent cases first
- **Filter by "Called = FALSE"** to see only the pending call list
- **Timestamps are automatic** — checking a box fills in the time, no typing
- **Sharable** — everyone on the team can have the same link open
- **Mobile-friendly** — Google Sheets works on phones, so team members can check boxes right after they hang up

---

## 10. Two Versions: Simple Base vs. Advanced

We're building two versions. Start with Simple, upgrade to Advanced when ready.

### Simple Base — "Just works"

| Feature | Included |
|---------|----------|
| iPhone Shortcut trigger | ✅ |
| AI extraction (name, phone, email, complaint, diagnosis, injury type, zip) | ✅ |
| Google Sheet logging with checkboxes | ✅ |
| Auto-timestamps on checkbox click | ✅ |
| WhatsApp team notification (new referral) | ✅ |
| Twice-daily stale check (flat 24h window) | ✅ |
| Pending referral count in every message | ✅ |
| Google Sheet link in every message | ✅ |
| Welcome email to patient | ✅ |
| Test suite (curl commands to verify) | ✅ |

### Advanced — "Wow factor"

Everything in Simple, plus:

| Feature | Added |
|---------|-------|
| Tier system (🔴🟠🟡⚪) with per-tier SLAs | ✅ |
| Auto-reply to referral source | ✅ |
| Insurance detection & flagging | ✅ |
| Zip/area code → nearest clinic matching | ✅ |
| Calendar integration → available appointment slots | ✅ |
| Tier-aware stale alerts (T1 alerts faster than T3) | ✅ |
| Missing info flagging | ✅ |
| Escalation alerts (direct to owner for severely overdue) | ✅ |
| Clinic-specific routing (if certain locations handle certain injury types) | ✅ |

---

## 11. Questions We Need Answered

These questions will let us dial in the system perfectly. Grouped by priority.

### Critical (answer these first)

**1. Real message samples**
Can you screenshot or copy-paste 3-4 actual referral texts you've received recently? (Redact names/numbers.) Seeing the real format the AI will need to parse is 10x more valuable than a description.

**2. Referral language**
Do senders always use the word "referral"? Or is it more like "got a patient for you," "sending someone your way," etc.? What words/phrases show up most? This determines how the iPhone Shortcut triggers.

**3. Multiple texts**
Do referrals ever come as multiple texts in a row? Like one message with the name, then a second with the phone number? If so, we need to handle message batching.

**4. Assignment model**
When a referral comes in, should ONE person own it (rotating), or does the whole team see it and whoever grabs it first calls? This changes how the WhatsApp notifications and the sheet work.

**5. Team size**
How many people on your booking team?

**6. Full workflow**
When your team calls a referral, what's the complete sequence? Just call and schedule? Call + schedule + send intake forms? Call + verify insurance + schedule + send paperwork? Every step becomes a trackable checkpoint.

**7. Missing info wish list**
What info do you *wish* every referral included but often doesn't? We'll have the AI flag anything missing so your team knows before they call.

### Important (answer when you can)

**8. Referral sources**
How many different people/offices send you referrals? Small group of regulars or wide net?

**9. Volume & timing**
Roughly how many referrals per week? Do they cluster at certain times or come in throughout the day? Any nights/weekends?

**10. Clinic locations**
How many clinic locations do you have, and where? (Zip codes or city names.) This powers the "nearest clinic" matching.

**11. Scheduling system**
What calendar or scheduling tool do you use? (Google Calendar, Calendly, Acuity, Jane App, your EHR's scheduler, a paper schedule?) This determines whether we can auto-suggest open appointment slots.

**12. Clinic specialization**
Do all clinics accept all types of patients, or are certain locations specialty-specific? (e.g., one does only MVA, another does workers comp)

**13. Appointment availability**
Is your schedule typically open with lots of slots, or tight where openings are scarce?

**14. WhatsApp setup**
Does your team already share one WhatsApp group, or are they in separate individual chats?

**15. Online booking**
Do you have a booking link patients can use, or is it call-only?

### The Dream Question

**16. If this system worked perfectly and you could add one more feature, what would it be?**

---

## 12. Future Feature Ideas

These aren't in v1 or v2. They're ideas to float after the system is running and he sees the value. Listed from most to least impactful:

| Feature | What It Does |
|---------|-------------|
| **Weekly Scorecard** | Every Monday: "Last week — 14 referrals, 11 called within SLA, 9 booked. Avg response time: 47 min. Sarah: 5 booked, Mike: 3, Jessica: 1." Accountability without micromanaging. |
| **Auto-Reassignment** | If a referral assigned to Sarah isn't called within her SLA, auto-reassign to Mike and notify both. |
| **Referral Source Leaderboard** | Track which doctors/offices send the most referrals. Helps prioritize relationship-building. |
| **Conversion Rate Tracking** | Referral → Called → Booked → Showed Up. See where patients drop off. |
| **No-Show Follow-Up** | If a booked patient doesn't show, auto-trigger a follow-up text/call task. |
| **Patient Texting** | Let the team text patients directly from the system instead of personal phones. |
| **Monthly Report** | Auto-generated PDF: referral volume trends, booking rate, response times, top referral sources. |
| **Multi-Language Support** | If patients speak Spanish, the welcome email and appointment confirmations go out in Spanish. |
| **Intake Form Auto-Send** | After booking, auto-email the intake forms so the patient arrives with paperwork done. |

---

## 13. Cost Breakdown

### Simple Base

| Item | Monthly Cost |
|------|-------------|
| Google Sheets + Apps Script | Free |
| iPhone Shortcuts | Free |
| Anthropic API (Claude AI) | ~$5-15 (at ~$0.08/referral) |
| Twilio WhatsApp messages | ~$2-5 |
| Gmail (welcome emails) | Free |
| **Total (~50-100 referrals/month)** | **~$8-20/month** |

### Advanced

| Item | Monthly Cost |
|------|-------------|
| Everything in Simple | ~$8-20 |
| Additional AI calls (tier analysis, clinic matching) | +$3-5 |
| Additional WhatsApp (auto-replies, tier alerts) | +$2-3 |
| Calendar API (if using Google Calendar) | Free |
| **Total (~50-100 referrals/month)** | **~$15-30/month** |

For context: **one booked patient** likely generates hundreds to thousands of dollars in revenue. The system pays for itself if it saves even one referral per month from falling through the cracks.

---

*Package location: `~/referral-tracker/`*
*Files: `SETUP-GUIDE.md` (setup), `apps-script.gs` (code), `shortcut-steps.md` (iPhone), `test-webhook.sh` (testing)*
*This document: `docs/COMPLETE-PLAN.md`*
