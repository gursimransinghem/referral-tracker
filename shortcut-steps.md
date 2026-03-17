# iPhone Shortcut Setup — Detailed Steps

This walks through creating the iPhone Shortcut automation that triggers when you receive a referral text.

---

## Option A: Auto-Trigger (Recommended)

Runs automatically when a text matching your criteria arrives. No manual action needed.

### Steps:

1. **Open Shortcuts app** → tap **Automation** tab (bottom)

2. **Tap + (top right)** → select **Message**

3. **Configure the trigger:**
   - Tap **"Message Contains"**
   - Type: `referral`
   - (Optional: also add variations like `ref`, `patient`, `new patient`)
   - OR tap **"Sender"** → add specific contacts who send you referrals
   - Select: **"is received"**

4. **When it asks "When should this run?":**
   - Select **"Run Immediately"**
   - Turn off **"Notify When Run"** (optional, for stealth)

5. **Build the action sequence:**

   **Action 1 — Get the message content:**
   - The trigger gives you `Shortcut Input` containing the message
   - This includes the message body and sender info

   **Action 2 — Format Current Date:**
   - Search for: "Date"
   - Add: **"Current Date"**
   - Tap the date format → choose **Custom** → type: `yyyy-MM-dd'T'HH:mm:ssZ`
   - This gives an ISO timestamp

   **Action 3 — Build the webhook payload:**
   - Search for: "Dictionary"
   - Add: **"Dictionary"**
   - Add these key-value pairs:
     - `message` → tap the value → select **"Shortcut Input"** (the message body)
     - `sender` → tap the value → select **"Shortcut Input"** → tap and change to **"Sender"**
     - `timestamp` → tap the value → select the **"Current Date"** variable from Action 2

   **Action 4 — Send to your webhook:**
   - Search for: "URL"
   - Add: **"Get Contents of URL"**
   - URL field: paste your Google Apps Script web app URL
     `https://script.google.com/macros/s/AKfycbx.../exec`
   - Tap **"Show More"**
   - Method: **POST**
   - Headers: Add one →
     - Key: `Content-Type`
     - Value: `application/json`
   - Request Body: **JSON**
   - Body: Select the **Dictionary** variable from Action 3

6. **Tap Done** — the automation is now active.

### Testing:
- Have someone text you a message containing "referral"
- Or text yourself from another phone
- Check your Google Sheet — a new row should appear within ~10 seconds

---

## Option B: Manual Trigger (Share Sheet)

If you want to review each text before forwarding, use a manual shortcut
you trigger from the share menu or home screen.

### Steps:

1. **Open Shortcuts app** → tap **All Shortcuts** or **My Shortcuts**

2. **Tap + (top right)** to create a new shortcut

3. **Name it:** "Log Referral" (tap the name at the top)

4. **Build the actions:**

   **Action 1 — Ask for input:**
   - Search for: "Ask"
   - Add: **"Ask for Input"**
   - Prompt: `Paste the referral message`
   - Input Type: **Text**

   **Action 2 — Current Date** (same as Option A, Action 2)

   **Action 3 — Dictionary** with keys:
   - `message` → **"Provided Input"** (from the Ask action)
   - `sender` → type: `manual`
   - `timestamp` → **"Current Date"** variable

   **Action 4 — Get Contents of URL** (same as Option A, Action 4)

   **Action 5 — Show notification (optional confirmation):**
   - Search for: "Notification"
   - Add: **"Show Notification"**
   - Title: `Referral Logged ✅`
   - Body: `Check the Google Sheet`

5. **Add to Home Screen:**
   - Tap the **⋯** menu on the shortcut → **Add to Home Screen**
   - Choose an icon/color you'll spot quickly

### Usage:
- Receive a referral text → copy the message → tap the "Log Referral" icon → paste → done

---

## Option C: Hybrid (Auto + Confirmation)

Triggers automatically but shows you a quick confirmation before sending.

Modify Option A by adding this between the trigger and the webhook call:

**Insert Action — Show Alert:**
- Search for: "Alert"
- Add: **"Show Alert"**
- Title: `New referral detected`
- Message: select **"Shortcut Input"**
- Show Cancel Button: **Yes**

If you tap OK → the webhook fires. If you tap Cancel → nothing happens.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Automation doesn't trigger | Go to Settings → Shortcuts → Advanced → turn on "Allow Running Scripts" and "Share Large Amounts of Data" |
| "Not allowed to connect" error | In the Shortcut, the first time it runs you may need to tap "Allow" for the URL connection |
| Message body is empty | Make sure you're selecting "Shortcut Input" (the message content), not the message object itself. Tap and drill into the variable to select "Body" or "Message" specifically |
| Sender shows as blank | Some iOS versions require tapping into the Shortcut Input variable and selecting "Sender" as a sub-property |
| Shortcut runs but nothing in Sheet | Test the webhook URL directly in Safari — it should show `{"status":"ok"}`. If not, re-deploy the Apps Script |

---

## Tips

- **Multiple keywords:** In the Message Contains trigger, you can add multiple words. Any match triggers the automation.
- **Specific senders:** You can combine keyword + sender filters — e.g., only trigger when Dr. Smith texts you the word "referral."
- **Do Not Disturb:** The automation runs even in DND/Focus mode.
- **Battery:** Shortcut automations have negligible battery impact.
- **Reliability:** iPhone Shortcuts automations are very reliable for message triggers. They run within seconds of receiving the text.
