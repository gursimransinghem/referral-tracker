# Referral Tracker (Advanced) — Deployment & Testing Guide

Everything your friend needs to go from "I have the code" to "it's working."

**Time:** ~45 minutes  
**Skill level:** None required — follow each step literally  
**Cost:** ~$15-30/month for 50-100 referrals

---

## Before You Start — Get These 4 Things

| What | Where | Time | Cost |
|------|-------|------|------|
| **Anthropic API key** | https://console.anthropic.com → Settings → API Keys → Create Key | 5 min | ~$5-20/mo |
| **Twilio account** | https://www.twilio.com/try-twilio → Sign up | 10 min | ~$1-5/mo |
| **Google account** | You probably have one | — | Free |
| **iPhone with Shortcuts app** | Already on your phone | — | Free |

> **Anthropic sign-up:** Create account → add a payment method → go to Settings → API Keys → "Create Key" → copy it. It starts with `sk-ant-...`. Save it somewhere safe.

> **Twilio sign-up:** Create account (free trial gives $15 credit) → from the Console dashboard, copy your **Account SID** (starts with `AC`) and **Auth Token**. You'll also need to set up a WhatsApp sandbox (instructions below).

---

## Step 1: Create the Google Sheet

1. Go to https://sheets.google.com
2. Click **Blank spreadsheet**
3. Name it: **Referral Tracker** (click "Untitled spreadsheet" at top left)
4. **Copy the Sheet ID** from the URL bar:
   ```
   https://docs.google.com/spreadsheets/d/THIS_PART_IS_YOUR_SHEET_ID/edit
   ```
   It's the long string of letters and numbers between `/d/` and `/edit`. Save this — you need it soon.

**Don't create any tabs or headers.** The script does this for you automatically.

---

## Step 2: Paste the Script

1. In your Google Sheet, click **Extensions → Apps Script**
2. A new tab opens with a code editor
3. **Delete everything** in the editor (select all → delete)
4. Open `apps-script-advanced.gs` (the file in this package)
5. **Copy the entire file** and paste it into the editor
6. At the top of the code, find the `CONFIG` section and fill in your values:

```javascript
const CONFIG = {
  ANTHROPIC_API_KEY: 'sk-ant-your-key-here',        // From Step "Before You Start"
  TWILIO_SID:        'ACxxxxxxxxxxxxxxxxxxxxxxxx',   // From Twilio Console
  TWILIO_TOKEN:      'your-auth-token-here',         // From Twilio Console
  TWILIO_WHATSAPP:   'whatsapp:+14155238886',        // Leave as-is for sandbox
  TWILIO_SMS:        '+1XXXXXXXXXX',                 // Your Twilio phone number (buy one for $1.15/mo)
  SPREADSHEET_ID:    'your-sheet-id-from-step-1',    // The long string you copied
};
```

7. Click **Save** (💾 icon or Ctrl+S)

---

## Step 3: Run the Setup Function

This creates all 6 sheet tabs with correct headers automatically.

1. In the Apps Script editor, find the **function dropdown** at the top (it probably says `doPost`)
2. Change it to `setupSheets`
3. Click **▶ Run**
4. **First time only:** Google asks for permission
   - Click "Review permissions"
   - Choose your Google account
   - Click "Advanced" → "Go to Untitled project (unsafe)" → "Allow"
   - (This is normal — it's your own script accessing your own sheet)
5. Go back to your Google Sheet tab — you should see **6 new tabs** at the bottom:
   - Referrals, Team, Clinics, Config, Log, PendingReplies

✅ **Checkpoint:** You should see 6 tabs with bold headers in row 1 of each.

---

## Step 4: Fill In Your Practice Info

### Config tab
Click the **Config** tab. You'll see default values — update them:

| Setting | What to put |
|---------|------------|
| `owner_number` | Your personal phone in international format: `+1XXXXXXXXXX` |
| `practice_name` | Your practice name (e.g., "Miami Pain & Spine") |
| `practice_phone` | Your main office number |
| `practice_address` | Your main office address |
| `booking_url` | Your online booking link (or leave blank) |
| `sheet_url` | Paste the full URL of this Google Sheet |
| `sla_t1_minutes` | 60 (T1 urgent: call within 1 hour — leave as default unless you want different) |
| `sla_t2_minutes` | 240 (T2 priority: 4 hours) |
| `sla_t3_minutes` | 1440 (T3 standard: 24 hours) |
| `sla_t4_minutes` | 1440 (T4 needs info: 24 hours) |

The `est_value_*` rows are for the revenue estimates shown in stale alerts. Defaults are fine.

### Team tab
Add each team member who should get WhatsApp alerts:

| Name | WhatsApp Number | Active |
|------|----------------|--------|
| Sarah | +14155551234 | TRUE |
| Mike | +14155555678 | TRUE |

- Numbers **must** be international format: `+1` then 10 digits
- Set Active to `TRUE` or `FALSE` to include/exclude someone
- The owner number (from Config) always gets messages too

### Clinics tab
Add your clinic locations:

| Clinic Name | Address | Zip | Area Codes | Specialties | Is Default | Upcoming Slots |
|------------|---------|-----|-----------|-------------|-----------|----------------|
| Miami Lakes | 15600 NW 67th Ave, Miami Lakes FL | 33014 | 305,786 | Pain Management, PT | TRUE | Mon 10am; Tue 2pm |
| Doral | 8200 NW 41st St, Doral FL | 33166 | 305,786 | Pain Management | TRUE | Wed 9am; Thu 1pm |
| Hialeah | 1450 W 49th St, Hialeah FL | 33012 | 305,786 | Injections, PT | FALSE | Fri 11am |

- **Area Codes:** comma-separated, no spaces after comma is fine
- **Is Default:** `TRUE` = shown when patient has no zip code
- **Upcoming Slots:** separate multiple slots with `;` — update weekly or as needed
- The system uses zip code first (nearest match), then area code, then defaults

---

## Step 5: Set Up Twilio WhatsApp

### Sandbox (for testing — free, takes 2 minutes)

1. Go to Twilio Console → **Messaging → Try it out → Send a WhatsApp message**
2. You'll see a message like: "Send `join hungry-elephant` to +1 415 523 8886"
3. **Every person on your Team tab** must send that exact message from their phone's WhatsApp to that number
4. Once they send it, they're connected to your sandbox

> **Important:** Sandbox connections expire after 72 hours of no messages. For permanent setup, apply for a Twilio WhatsApp Business number (free, takes 1-3 business days).

### Buy a Twilio Phone Number (for auto-reply SMS — $1.15/month)

1. Twilio Console → **Phone Numbers → Buy a Number**
2. Search for your area code
3. Buy one — put the number in `TWILIO_SMS` in the CONFIG section
4. This is used for the 30-minute auto-reply text back to referral sources

---

## Step 6: Set Up Triggers

This makes the stale checks and auto-replies run automatically.

1. Go back to the Apps Script editor
2. Change the function dropdown to `setupTriggers`
3. Click **▶ Run**
4. You should see in the log: "All triggers created"

This creates 3 automatic triggers:
- **9 AM daily:** Morning stale check → WhatsApp to team
- **4 PM daily:** Afternoon stale check → WhatsApp to team
- **Every 5 minutes:** Processes queued auto-replies (the 30-min delayed thank-you texts)

To verify: click the **⏰ clock icon** in the left sidebar → you should see 3 triggers listed.

---

## Step 7: Deploy as Web App

This creates the URL that your iPhone Shortcut will send texts to.

1. In Apps Script, click **Deploy → New deployment**
2. Click the **gear icon ⚙️** next to "Select type" → choose **Web app**
3. Fill in:
   - **Description:** "Referral Tracker"
   - **Execute as:** Me
   - **Who has access:** Anyone
4. Click **Deploy**
5. **Copy the Web App URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycbx.../exec
   ```
6. **Save this URL.** You need it for the iPhone Shortcut and for testing.

---

## Step 8: Test Everything

### Test A: Is the webhook alive?

Open your Web App URL in a browser. You should see:
```json
{"status":"ok","service":"Referral Tracker Advanced","ts":"2026-03-17T..."}
```

✅ If you see this, the deployment worked.

### Test B: Full referral (from the script editor)

1. In Apps Script, change the function dropdown to `testFullReferral`
2. Click **▶ Run**
3. Check these things:
   - [ ] **Referrals tab:** New row with REF-0001, patient "Maria Garcia," tier T1 or T2
   - [ ] **WhatsApp:** All team members received the alert with patient details
   - [ ] **Log tab:** Shows INCOMING, PROCESSED events
   - [ ] **PendingReplies tab:** Shows a queued auto-reply

### Test C: Sparse referral

1. Run `testSparseReferral`
2. Check:
   - [ ] New row in Referrals tab — "James Wilson"
   - [ ] Missing Info column should list email, zip, diagnosis, insurance
   - [ ] Nearest Clinic should show default clinics (by area code 305)
   - [ ] WhatsApp message includes ⚠️ Missing fields

### Test D: Non-referral filter

1. Run `testNotAReferral`
2. Check:
   - [ ] **No new row** in Referrals tab (the golf message should be filtered out)
   - [ ] Log tab shows NOT_REFERRAL event

### Test E: Stale check

1. Make sure Test B left a referral in the sheet with Status = "New"
2. Run `testStaleCheck` (this runs the morning check)
3. Check:
   - [ ] WhatsApp message with pending/stale counts
   - [ ] Any referral older than its SLA shows as overdue with dollar amount

### Test F: Auto-reply

1. Wait 5 minutes (or manually run `testAutoReplies`)
2. The PendingReplies tab should show "YES" in the Sent column
3. Note: The actual SMS won't send to fake numbers — check the Log tab for the AUTO_REPLY event

### Test G: onEdit triggers

1. In the Referrals tab, go to the Maria Garcia row
2. Type your name in the **Claimed By** column (Q)
3. Check: Status should auto-change from "New" to "Claimed"
4. Click the **Status** dropdown → change to "No Answer"
5. Check: Attempts column should show 1, Called At should have a timestamp
6. Change Status to "Booked"
7. Check: Booked checkbox ☑, Booked At timestamp filled

✅ **If all 7 tests pass, the system is fully operational.**

---

## Step 9: Set Up the iPhone Shortcut

This is the trigger — when a referral text arrives on your phone, it auto-forwards to the system.

### Option A: Automatic (Recommended)

1. Open **Shortcuts** app → **Automation** tab
2. Tap **+** → **Message**
3. Configure:
   - **Message Contains:** `referral` (or add multiple: `patient`, `got a referral`, `sending you`)
   - OR tap **Sender** and add specific contacts
   - Set to trigger on: **"is received"**
   - Toggle: **Run Immediately** (don't ask first)
4. Tap **New Blank Automation**
5. Add these actions in order:

**Action 1: Get Contents of URL**
- URL: `YOUR_WEB_APP_URL` (from Step 7)
- Method: **POST**
- Headers: `Content-Type` = `application/json`
- Request Body: **JSON**
- Add two fields:
  - Key: `message` → Value: tap "Shortcut Input" → **Content**
  - Key: `sender` → Value: tap "Shortcut Input" → **Sender**

6. Save. Done.

### Option B: Manual (review before sending)

1. Create a new **Shortcut** (not automation)
2. Name it: "Log Referral"
3. Add: **Ask for Input** → Text → "Paste the referral message"
4. Add: **Get Contents of URL** → same config as above, but use the input variable for `message`
5. Add to your Home Screen for one-tap access

### Option C: Hybrid

Use both — automatic for known senders (attorneys, specific doctors), manual for everyone else.

---

## Step 10: Go Live Checklist

Before your first real referral:

- [ ] All 4 credentials filled in CONFIG section
- [ ] `setupSheets` run successfully (6 tabs created)
- [ ] `setupTriggers` run successfully (3 triggers visible)
- [ ] Config tab filled with real practice info
- [ ] Team tab has all team members with correct WhatsApp numbers
- [ ] Clinics tab has at least your main locations
- [ ] All team members joined the Twilio WhatsApp sandbox
- [ ] Web app deployed and URL copied
- [ ] `testFullReferral` passed (row appears, WhatsApp received)
- [ ] `testSparseReferral` passed (missing fields flagged)
- [ ] `testNotAReferral` passed (no row created)
- [ ] iPhone Shortcut created and tested with a real text message
- [ ] Sent yourself a test text containing "referral" → confirmed it triggered

---

## Daily Workflow

### For referral sources (doctors, attorneys, chiropractors):
**Nothing changes.** They keep texting you like always.

### For you (the owner):
- Referrals process automatically. You get WhatsApp confirmations.
- 9 AM + 4 PM: stale alerts with dollar amounts at risk
- T1 referrals overdue by 2+ hours: personal escalation alert to your number
- T4 "needs info" referrals: flagged for you to follow up with the referral source
- Open the Google Sheet anytime for full dashboard view

### For your team:
1. Get WhatsApp alert with patient details + which clinics to offer
2. Open the Google Sheet (link in every message)
3. Type your name in **Claimed By** (prevents someone else calling the same patient)
4. Call the patient
5. Set **Status** dropdown: No Answer → Left VM → Scheduling → Booked
6. If booked: check the **Booked ☐** checkbox

That's it. The system handles everything else.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Authorization required" error | Re-deploy: Deploy → Manage deployments → ✏️ edit → New version → Deploy |
| No row appears after test | Check Executions log (left sidebar) for red errors. Usually a credential typo. |
| WhatsApp not received | All team members must have sent the sandbox join message. Check Team tab numbers have `+1` prefix. |
| AI extraction looks wrong | Check the Raw Message column (X) — sometimes unusual wording confuses it. The system errs on the side of logging everything. |
| Welcome email not sending | Only sends if the referral contained an email address. Check Gmail quota (500/day). |
| Stale check not firing | Click ⏰ triggers → verify 3 triggers exist. If not, run `setupTriggers` again. |
| Duplicate detected incorrectly | Matches on phone number within 90 days. If a real new referral has the same phone, manually add it to the sheet. |
| "Exceeded maximum execution time" | Rare — usually means the AI API is slow. Check Anthropic status page. |
| Script stopped working after changes | Deploy → Manage deployments → ✏️ → bump to "New version" → Deploy. Old URL stays the same. |

---

## Costs Breakdown

| Item | Monthly Cost |
|------|:-----------:|
| Anthropic API (Claude) | ~$5-20 (≈$0.08/referral) |
| Twilio WhatsApp messages | ~$1-3 ($0.005/msg) |
| Twilio phone number (for SMS auto-reply) | $1.15 |
| Twilio SMS messages | ~$1-2 ($0.0079/msg) |
| Google Sheets + Apps Script + Gmail | Free |
| iPhone Shortcuts | Free |
| **Total (50-100 referrals/month)** | **$8-27/month** |

---

## Updating the System

### Add/remove team members
Edit the Team tab. Set Active to FALSE to stop someone's alerts. No code changes.

### Add/remove clinics
Edit the Clinics tab. Changes take effect on the next referral.

### Change SLA times
Edit the Config tab values (in minutes). 60 = 1 hour, 240 = 4 hours, 1440 = 24 hours.

### Update appointment slots
Edit the Upcoming Slots column in the Clinics tab. Separate slots with `;`. Update weekly.

### Add the auto-reply thank-you text
Already built in. Works automatically as soon as `TWILIO_SMS` has a real number.
