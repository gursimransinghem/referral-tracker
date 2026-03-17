# Referral Tracker v2 — Complete Setup Guide

A system where your iPhone catches referral texts, an AI agent extracts and standardizes the patient info, logs it to a live Google Sheet, notifies your team via WhatsApp, and runs twice-daily stale checks so nothing falls through the cracks.

**Total cost: ~$25-35/month** (mostly the AI API key).

---

## How It Works (Plain English)

```
Someone texts you a referral
  → iPhone Shortcut detects it (keyword "referral" OR specific sender)
  → Shortcut sends the raw text to your Google Apps Script webhook
  → Script calls Claude AI to extract & standardize patient details
  → Patient info is added to your Google Sheet (your live call list)
  → WhatsApp group message goes out: "New referral added, X pending"
  → If email was included, a welcome email auto-sends to the patient
  → Twice daily (9 AM + 4 PM): stale referral alerts to WhatsApp group
  → Team checks boxes in the sheet as they call & book patients
```

Nothing changes for the people who send you referrals. They keep texting you.

---

## What You Need Before Starting

| Item | Where to get it | Cost |
|------|----------------|------|
| iPhone with Shortcuts app | Already on your phone | Free |
| Google account | You probably have one | Free |
| Anthropic API key (for Claude AI) | https://console.anthropic.com | ~$5-20/month based on volume |
| Twilio account (for WhatsApp) | https://www.twilio.com | ~$1-5/month |
| Gmail account (for welcome emails) | Same Google account works | Free |

**Total setup time: ~45 minutes**

---

## Step 1: Create the Google Sheet (10 minutes)

1. Go to https://sheets.google.com → **Create new spreadsheet**
2. Name it: **"Referral Call List"**

### Sheet 1: Rename to "Referrals"
Add these headers in **Row 1** (freeze this row: View → Freeze → 1 row):

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Referral ID | Logged At | Patient Name | Phone | Email | Complaint | Diagnosis | Injury Type | Zip Code | Referral Source | Called ☐ | Called At | Called By | Booked ☐ | Booked At |

> **Formatting tips for the sheet:**
> - Select columns K and N → Format → Checkbox (these become clickable check boxes)
> - Select column B → Format → Number → Date time
> - Widen columns as needed so text is readable
> - Consider color-coding: light red for uncalled, light green for booked

### Sheet 2: "Team" (click + at bottom to add)

| A | B | C |
|---|---|---|
| Name | WhatsApp Number | Active |
| Sarah | +14155551234 | TRUE |
| Mike | +14155555678 | TRUE |
| Jessica | +14155559012 | TRUE |

> Numbers must be international format: +1XXXXXXXXXX for US.

### Sheet 3: "Config"

| A | B |
|---|---|
| Setting | Value |
| owner_number | +14155550000 |
| stale_hours | 24 |
| morning_check_hour | 9 |
| afternoon_check_hour | 16 |
| practice_name | [Your Practice Name] Pain Management |
| practice_phone | (555) 000-0000 |
| practice_address | 123 Main St, City, FL 33XXX |
| booking_url | https://your-booking-link.com |
| welcome_email_from | yourname@gmail.com |
| sheet_url | (paste the full URL of this Google Sheet here) |

### Sheet 4: "Log" (for system events — optional but useful for debugging)

| A | B | C |
|---|---|---|
| Timestamp | Event | Details |

---

## Step 2: Add the Google Apps Script (15 minutes)

1. In your Google Sheet → **Extensions → Apps Script**
2. Delete everything in the editor
3. Copy-paste the **entire** contents of `apps-script.gs` (included in this package)
4. Click **Save** (💾)

### Set your credentials in the script:
At the top of the code, fill in your values:
- `ANTHROPIC_API_KEY` — from https://console.anthropic.com/settings/keys
- `TWILIO_SID` and `TWILIO_TOKEN` — from https://console.twilio.com
- `TWILIO_WHATSAPP` — the Twilio sandbox or production WhatsApp number
- `SPREADSHEET_ID` — from your Google Sheet URL (the long string between /d/ and /edit)

### Deploy as a Web App:
1. Click **Deploy → New deployment**
2. Gear icon ⚙️ → **Web app**
3. Settings:
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**
5. **Copy the Web app URL** — you need it for the iPhone Shortcut
   - It looks like: `https://script.google.com/macros/s/AKfycbx.../exec`
6. First time: authorize when prompted (Advanced → Go to Referral Call List → Allow)

### Set up the Twice-Daily Stale Checks:
1. In Apps Script, click the ⏰ clock icon (Triggers) in the left sidebar
2. Click **+ Add Trigger** and create TWO triggers:

**Trigger 1 — Morning check:**
- Function: `morningStaleCheck`
- Event source: Time-driven
- Type: Day timer
- Time: 9am to 10am

**Trigger 2 — Afternoon check:**
- Function: `afternoonStaleCheck`
- Event source: Time-driven
- Type: Day timer
- Time: 4pm to 5pm

---

## Step 3: Set Up Twilio for WhatsApp (10 minutes)

### Create Account
1. https://www.twilio.com/try-twilio → Sign up (free trial = $15 credit)
2. Note your **Account SID** and **Auth Token** from the console dashboard

### WhatsApp Sandbox (for testing — free)
1. Twilio Console → **Messaging → Try it out → Send a WhatsApp message**
2. Follow the "join ____" instructions — send that message from YOUR phone
3. **Have every team member send the same join message** from their phones
4. In sandbox settings, set the webhook URL to your Apps Script URL (for acknowledgments)

> **Production upgrade (when ready):** Apply for a Twilio WhatsApp Business number.
> Removes the sandbox join requirement. Takes 1-3 days for approval. No extra cost.

---

## Step 4: Set Up the iPhone Shortcut (10 minutes)

This is what triggers the whole system when you receive a referral text.

### Create the Shortcut Automation:

1. Open **Shortcuts** app on your iPhone
2. Tap **Automation** tab at the bottom
3. Tap **+ New Automation** (or the + in the top right)
4. Choose **Message**
5. Configure the trigger:
   - **Message Contains**: `referral` (or `ref`, or whatever keyword your sources typically use)
   - OR tap **Sender** → add specific contacts who send you referrals
   - Choose: "is received"
   - **Run Immediately** (not "Ask Before Running")
   - Turn OFF "Notify When Run" if you want it silent

6. For the action, tap **New Blank Automation** then build these steps:

### Shortcut Steps (in order):

**Step 1: Set Variable**
- Add action: "Set Variable"
- Variable name: `MessageBody`  
- Value: tap "Shortcut Input" → select **Message** (the content of the received text)

**Step 2: Set Variable**
- Add action: "Set Variable"
- Variable name: `SenderNumber`
- Value: tap "Shortcut Input" → select **Sender** (the phone number)

**Step 3: Get Contents of URL** (this calls your webhook)
- Add action: "Get Contents of URL"
- URL: `YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL`
- Method: **POST**
- Headers: Add header → Key: `Content-Type` Value: `application/json`
- Request Body: **JSON**
  - Add fields:
    - `message` (Text): select the `MessageBody` variable
    - `sender` (Text): select the `SenderNumber` variable  
    - `timestamp` (Text): Add a "Current Date" action before this, formatted as ISO 8601

That's it. Save the automation.

### Alternative: Manual Shortcut (if you want to review before forwarding)

If you prefer to manually trigger it (e.g., you want to confirm it's a real referral first):

1. Create a regular **Shortcut** (not Automation)
2. Name it: "Log Referral"
3. Add action: **"Ask for Input"** → Type: Text → Prompt: "Paste the referral text"
4. Add action: **"Get Contents of URL"** → same webhook config as above
5. Add the shortcut to your Home Screen for quick access
6. When you get a referral text: copy the message → tap the shortcut → paste → done

---

## Step 5: Set Up Gmail for Welcome Emails (5 minutes)

The welcome email sends automatically via your Gmail when the AI detects an email address in the referral. No extra setup needed — Google Apps Script uses your Google account's Gmail.

Just make sure:
1. The `welcome_email_from` in your Config sheet matches your Gmail address
2. You've filled in `practice_name`, `practice_phone`, `practice_address`, and `booking_url`

The email template is in the script and includes:
- Professional greeting with the patient's name
- What to expect at their first visit
- How to book an appointment (with your booking link)
- What to bring (insurance card, ID, referral paperwork, imaging)
- Your practice contact info

You can customize the email text in the `generateWelcomeEmail` function in the script.

---

## Step 6: Test Everything (5 minutes)

### Test 1: Webhook
Open this URL in your browser — you should see a JSON "status: ok" message:
`YOUR_APPS_SCRIPT_URL`

### Test 2: Simulated Referral
Either text yourself the word "referral" to trigger the Shortcut, or use the test script:
```bash
curl -X POST "YOUR_APPS_SCRIPT_URL" \
  -H "Content-Type: application/json" \
  -d '{"message": "Hey I have a referral for you. Patient Maria Garcia, DOB 3/15/1980, phone 786-555-1234, email maria.garcia@email.com. She was in a car accident last week, has neck and lower back pain. She lives in 33155. Diagnosis cervical strain and lumbar radiculopathy. Please get her in ASAP.", "sender": "+15551234567", "timestamp": "2026-03-17T10:00:00Z"}'
```

### What should happen:
1. ✅ New row appears in Google Sheet with extracted fields (name, phone, complaint, etc.)
2. ✅ WhatsApp message to your team group: "New referral added..."
3. ✅ Welcome email sent to maria.garcia@email.com
4. ✅ Check Apps Script execution log for any errors: Extensions → Apps Script → Executions

### Test 3: Stale Check
1. Leave a referral unchecked in the sheet
2. In Apps Script editor, manually run `morningStaleCheck`
3. You should get a WhatsApp alert listing the stale referral

---

## Daily Workflow

### For your referral sources:
They text you exactly like they always have. Nothing changes.

### For you:
- Referrals auto-process. You get WhatsApp confirmations.
- Open the Google Sheet anytime to see full status.
- Twice-daily WhatsApp alerts catch anything the team missed.

### For your team:
1. Receive WhatsApp: "🔔 New referral added to call list..."
2. Open the Google Sheet link (included in every message)
3. Call the patient
4. Check the **"Called ☐"** checkbox in the sheet
5. When appointment is confirmed, check **"Booked ☐"**

### WhatsApp messages your team sees:

**New referral:**
```
🔔 NEW REFERRAL ADDED

Patient: Maria Garcia
Phone: (786) 555-1234
Complaint: Neck and lower back pain (MVA)
Injury Type: Car Accident

📋 Pending referrals to call: 4

🔗 Open Call List: [link to sheet]
```

**Stale check (9 AM daily):**
```
📊 MORNING REFERRAL CHECK

✅ Called: 12
⏳ Pending: 3
🚨 Stale (>24h): 1

Stale referrals:
• Maria Garcia (786-555-1234) — logged 28h ago

🔗 Open Call List: [link to sheet]
```

---

## Costs Breakdown

| Item | Monthly Cost |
|------|-------------|
| Anthropic API (Claude) | ~$5-20 (depends on volume; ~$0.10/referral) |
| Twilio WhatsApp messages | ~$1-3 (at $0.005/msg) |
| Twilio phone number (optional) | $1.15 (only if you want SMS fallback) |
| Google Sheets + Apps Script | Free |
| Gmail sending | Free |
| iPhone Shortcuts | Free |
| **Total (~50-100 referrals/month)** | **~$10-25/month** |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Shortcut not triggering | Check Automation settings: "Run Immediately" must be ON. Check the keyword/sender filter matches. |
| Nothing in the Google Sheet | Check Apps Script Executions log for errors. Verify the webhook URL matches what's in the Shortcut. |
| AI extraction is wrong | The AI is good but not perfect — unusual message formats may confuse it. Check the "Raw Message" column (if debugging) and adjust the prompt in `extractReferralWithAI()`. |
| WhatsApp not received | All team members must have sent the sandbox join message. Check numbers in Team sheet. |
| Welcome email not sending | Check that the referral included an email. Check Gmail sending quota (500/day for free accounts). |
| Stale check not firing | Verify both triggers are set in Apps Script (clock icon). Check the Config sheet hours. |
| "Authorization required" | Re-deploy the web app: Deploy → Manage deployments → edit → new version → Deploy |

---

## Files in This Package

| File | What It Does |
|------|-------------|
| `SETUP-GUIDE.md` | This document |
| `apps-script.gs` | Complete Google Apps Script — paste into your sheet |
| `test-webhook.sh` | Curl commands to test without the iPhone |
| `welcome-email-template.html` | The patient welcome email (customizable) |
| `shortcut-steps.md` | Detailed iPhone Shortcut setup with screenshots descriptions |
