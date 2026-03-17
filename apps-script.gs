// =============================================================================
// REFERRAL TRACKER v2 — Google Apps Script
// Paste this entire file into Extensions → Apps Script in your Google Sheet.
// =============================================================================

// ── CONFIG — Fill in your values ──────────────────────────────────────────────
const CONFIG = {
  // Anthropic API key — from https://console.anthropic.com/settings/keys
  ANTHROPIC_API_KEY: 'YOUR_ANTHROPIC_API_KEY',

  // Twilio credentials — from https://console.twilio.com
  TWILIO_SID: 'YOUR_TWILIO_ACCOUNT_SID',
  TWILIO_TOKEN: 'YOUR_TWILIO_AUTH_TOKEN',

  // Twilio WhatsApp "From" number (sandbox default shown; swap for production)
  TWILIO_WHATSAPP_FROM: 'whatsapp:+14155238886',

  // Google Sheet ID — the long string between /d/ and /edit in your sheet URL
  SPREADSHEET_ID: 'YOUR_SPREADSHEET_ID_HERE',
};

// ── Sheet tab names (must match exactly) ──────────────────────────────────────
const SHEET = {
  REFERRALS: 'Referrals',
  TEAM:      'Team',
  CONFIG:    'Config',
  LOG:       'Log',
};

// ── Column indices for the Referrals sheet (1-based) ──────────────────────────
const COL = {
  REF_ID:        1,   // A — Referral ID
  LOGGED_AT:     2,   // B — Logged At
  PATIENT_NAME:  3,   // C — Patient Name
  PHONE:         4,   // D — Phone
  EMAIL:         5,   // E — Email
  COMPLAINT:     6,   // F — Complaint
  DIAGNOSIS:     7,   // G — Diagnosis
  INJURY_TYPE:   8,   // H — Injury Type
  ZIP:           9,   // I — Zip Code
  SOURCE:       10,   // J — Referral Source
  CALLED:       11,   // K — Called ☐
  CALLED_AT:    12,   // L — Called At
  CALLED_BY:    13,   // M — Called By
  BOOKED:       14,   // N — Booked ☐
  BOOKED_AT:    15,   // O — Booked At
};

// =============================================================================
// WEBHOOK — iPhone Shortcut or curl hits this endpoint
// =============================================================================

function doPost(e) {
  try {
    var payload;

    // Handle both JSON body and form-encoded parameters
    if (e.postData && e.postData.type === 'application/json') {
      payload = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      payload = e.parameter;
    } else {
      throw new Error('No payload received');
    }

    var rawMessage  = (payload.message  || payload.Body || '').trim();
    var sender      = (payload.sender   || payload.From || 'unknown').trim();
    var timestamp   = payload.timestamp || new Date().toISOString();

    if (!rawMessage) {
      return jsonResponse({ status: 'ignored', reason: 'empty message' });
    }

    logEvent('INCOMING', 'From: ' + sender + ' | Length: ' + rawMessage.length);

    // ── Step 1: Ask Claude to analyze the message ──
    var analysis = analyzeWithClaude(rawMessage, sender);

    if (!analysis.is_referral) {
      logEvent('NOT_REFERRAL', 'Message from ' + sender + ' was not a referral');
      return jsonResponse({ status: 'ignored', reason: 'not a referral', ai_reasoning: analysis.reasoning });
    }

    // ── Step 2: Log to Google Sheet ──
    var refId = addReferralToSheet(analysis, sender, rawMessage);

    // ── Step 3: Notify team via WhatsApp ──
    notifyTeam(analysis, refId);

    // ── Step 4: Send welcome email if email was provided ──
    if (analysis.email && analysis.email !== '' && analysis.email !== 'N/A') {
      sendWelcomeEmail(analysis);
      logEvent('WELCOME_EMAIL', 'Sent to ' + analysis.email + ' for ' + analysis.patient_name);
    }

    logEvent('REFERRAL_PROCESSED', 'ID: ' + refId + ' | Patient: ' + analysis.patient_name);

    return jsonResponse({
      status: 'processed',
      referral_id: refId,
      patient_name: analysis.patient_name,
      email_sent: !!(analysis.email && analysis.email !== '' && analysis.email !== 'N/A'),
    });

  } catch (err) {
    logEvent('ERROR', err.toString());
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

function doGet(e) {
  return jsonResponse({
    status: 'ok',
    service: 'Referral Tracker v2',
    timestamp: new Date().toISOString(),
  });
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =============================================================================
// AI EXTRACTION — Claude analyzes the raw text and extracts structured data
// =============================================================================

function analyzeWithClaude(rawMessage, sender) {
  var prompt = `You are a medical office referral intake assistant for a Pain Management specialist.

Analyze this text message and determine:
1. Is this actually a patient referral? (not a casual conversation, not spam, not a question)
2. If yes, extract all available patient details.

The practice handles: car accidents (MVA), personal injury, chronic pain, workers comp, slip and fall.

TEXT MESSAGE:
"""
${rawMessage}
"""

SENDER: ${sender}

Respond with ONLY valid JSON (no markdown, no backticks, no explanation). Use this exact structure:
{
  "is_referral": true or false,
  "reasoning": "one sentence on why this is or isn't a referral",
  "patient_name": "First Last" or "N/A",
  "phone": "formatted phone number" or "N/A",
  "email": "email@example.com" or "N/A",
  "complaint": "brief description of symptoms/reason for visit" or "N/A",
  "diagnosis": "medical diagnosis if mentioned" or "N/A",
  "injury_type": "Car Accident" or "Personal Injury" or "Workers Comp" or "Slip and Fall" or "Chronic Pain" or "Other" or "N/A",
  "zip_code": "XXXXX" or "N/A",
  "referral_source": "name or description of who sent the referral" or "N/A"
}

Rules:
- Phone numbers should be formatted as (XXX) XXX-XXXX when possible
- If the message is ambiguous but likely a referral, set is_referral to true
- Extract every detail available, even partial info
- For injury_type, infer from context (e.g. "MVA" = Car Accident, "fell at work" = Workers Comp)
- If the sender info gives a clue about the referral source, use it`;

  var response = callClaude(prompt);

  try {
    // Clean the response — strip any markdown formatting Claude might add
    var cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (parseErr) {
    logEvent('AI_PARSE_ERROR', 'Could not parse Claude response: ' + response.substring(0, 200));
    // Return a safe fallback — log it as a referral with raw text so nothing is lost
    return {
      is_referral: true,
      reasoning: 'AI parsing failed — logged as referral to be safe',
      patient_name: 'NEEDS REVIEW',
      phone: 'N/A',
      email: 'N/A',
      complaint: rawMessage.substring(0, 200),
      diagnosis: 'N/A',
      injury_type: 'N/A',
      zip_code: 'N/A',
      referral_source: sender,
    };
  }
}

function callClaude(prompt) {
  var url = 'https://api.anthropic.com/v1/messages';

  var options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [
        { role: 'user', content: prompt }
      ],
    }),
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  var body = JSON.parse(response.getContentText());

  if (code !== 200) {
    throw new Error('Claude API error ' + code + ': ' + (body.error ? body.error.message : 'unknown'));
  }

  return body.content[0].text;
}

// =============================================================================
// GOOGLE SHEET — Add the referral row
// =============================================================================

function addReferralToSheet(data, sender, rawMessage) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET.REFERRALS);
  var now = new Date();

  // Generate sequential referral ID
  var lastRow = sheet.getLastRow();
  var seq = lastRow; // row 1 = headers, row 2 = referral #1
  var refId = 'REF-' + ('0000' + seq).slice(-4);

  // Determine referral source — use AI-extracted or fall back to sender number
  var source = (data.referral_source && data.referral_source !== 'N/A')
    ? data.referral_source
    : sender;

  // Append the row
  sheet.appendRow([
    refId,                                                           // A: Referral ID
    now,                                                             // B: Logged At
    data.patient_name     !== 'N/A' ? data.patient_name     : '',   // C: Patient Name
    data.phone            !== 'N/A' ? data.phone            : '',   // D: Phone
    data.email            !== 'N/A' ? data.email            : '',   // E: Email
    data.complaint        !== 'N/A' ? data.complaint        : '',   // F: Complaint
    data.diagnosis        !== 'N/A' ? data.diagnosis        : '',   // G: Diagnosis
    data.injury_type      !== 'N/A' ? data.injury_type      : '',   // H: Injury Type
    data.zip_code         !== 'N/A' ? data.zip_code         : '',   // I: Zip Code
    source,                                                          // J: Referral Source
    false,                                                           // K: Called ☐
    '',                                                              // L: Called At
    '',                                                              // M: Called By
    false,                                                           // N: Booked ☐
    '',                                                              // O: Booked At
  ]);

  // Format the checkbox columns for the new row
  var newRow = lastRow + 1;
  sheet.getRange(newRow, COL.CALLED).insertCheckboxes();
  sheet.getRange(newRow, COL.BOOKED).insertCheckboxes();

  return refId;
}

// =============================================================================
// WHATSAPP TEAM NOTIFICATION
// =============================================================================

function notifyTeam(data, refId) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var config = getConfig(ss);
  var teamNumbers = getActiveTeamNumbers(ss);
  var pendingCount = countPending(ss);
  var staleList = getStaleReferrals(ss, parseInt(config.stale_hours) || 24);

  var sheetUrl = config.sheet_url || 'Check your Google Sheet';

  // Build the notification message
  var msg = '🔔 *NEW REFERRAL ADDED* (#' + refId + ')\n\n';
  msg += '👤 *Patient:* ' + (data.patient_name || 'Unknown') + '\n';

  if (data.phone && data.phone !== 'N/A') {
    msg += '📞 *Phone:* ' + data.phone + '\n';
  }
  if (data.complaint && data.complaint !== 'N/A') {
    msg += '💬 *Complaint:* ' + data.complaint + '\n';
  }
  if (data.injury_type && data.injury_type !== 'N/A') {
    msg += '🏷️ *Type:* ' + data.injury_type + '\n';
  }

  msg += '\n📋 *Pending referrals to call:* ' + pendingCount;

  if (staleList.length > 0) {
    msg += '\n\n🚨 *Stale (>' + (config.stale_hours || 24) + 'h, not called):*\n';
    for (var i = 0; i < staleList.length; i++) {
      msg += '  • ' + staleList[i].name + ' (' + staleList[i].phone + ') — ' + staleList[i].elapsed + '\n';
    }
  }

  msg += '\n🔗 ' + sheetUrl;

  // Send to all active team members
  for (var j = 0; j < teamNumbers.length; j++) {
    sendWhatsApp(teamNumbers[j], msg);
  }

  // Also send to the owner
  if (config.owner_number) {
    sendWhatsApp(config.owner_number, msg);
  }
}

// =============================================================================
// STALE REFERRAL CHECKS — Triggered by time-driven triggers (9 AM + 4 PM)
// =============================================================================

function morningStaleCheck() {
  runStaleCheck('MORNING');
}

function afternoonStaleCheck() {
  runStaleCheck('AFTERNOON');
}

function runStaleCheck(period) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var config = getConfig(ss);
  var staleHours = parseInt(config.stale_hours) || 24;
  var staleList = getStaleReferrals(ss, staleHours);
  var pendingCount = countPending(ss);
  var calledToday = countCalledToday(ss);
  var bookedToday = countBookedToday(ss);
  var sheetUrl = config.sheet_url || 'Check your Google Sheet';

  var emoji = period === 'MORNING' ? '☀️' : '🌆';
  var label = period === 'MORNING' ? 'MORNING' : 'AFTERNOON';

  var msg = emoji + ' *' + label + ' REFERRAL CHECK*\n\n';
  msg += '📊 *Status:*\n';
  msg += '  ✅ Called today: ' + calledToday + '\n';
  msg += '  📅 Booked today: ' + bookedToday + '\n';
  msg += '  ⏳ Pending (not called): ' + pendingCount + '\n';

  if (staleList.length > 0) {
    msg += '\n🚨 *STALE REFERRALS (>' + staleHours + 'h without a call):*\n';
    for (var i = 0; i < staleList.length; i++) {
      msg += '  • *' + staleList[i].name + '* — ' + staleList[i].phone + '\n';
      msg += '    Logged ' + staleList[i].elapsed + ' ago';
      if (staleList[i].complaint) {
        msg += ' | ' + staleList[i].complaint;
      }
      msg += '\n';
    }
    msg += '\n⚠️ These patients need to be called ASAP.';
  } else {
    msg += '\n✅ *No stale referrals.* All caught up!';
  }

  msg += '\n\n🔗 ' + sheetUrl;

  // Send to all active team members + owner
  var teamNumbers = getActiveTeamNumbers(ss);
  for (var j = 0; j < teamNumbers.length; j++) {
    sendWhatsApp(teamNumbers[j], msg);
  }

  var ownerNumber = config.owner_number;
  if (ownerNumber) {
    sendWhatsApp(ownerNumber, msg);
  }

  logEvent('STALE_CHECK', period + ' — Pending: ' + pendingCount + ', Stale: ' + staleList.length);
}

// =============================================================================
// WELCOME EMAIL — Sent to patient when email is detected
// =============================================================================

function sendWelcomeEmail(data) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var config = getConfig(ss);

  var practiceName = config.practice_name || 'Our Practice';
  var practicePhone = config.practice_phone || '';
  var practiceAddress = config.practice_address || '';
  var bookingUrl = config.booking_url || '';

  var patientFirst = (data.patient_name || 'there').split(' ')[0];

  var subject = 'Welcome to ' + practiceName + ' — Your Appointment Information';

  var body = generateWelcomeEmail(patientFirst, data, {
    practiceName: practiceName,
    practicePhone: practicePhone,
    practiceAddress: practiceAddress,
    bookingUrl: bookingUrl,
  });

  try {
    GmailApp.sendEmail(data.email, subject, '', {
      htmlBody: body,
      name: practiceName,
    });
  } catch (emailErr) {
    logEvent('EMAIL_ERROR', 'Failed to send to ' + data.email + ': ' + emailErr.toString());
  }
}

function generateWelcomeEmail(firstName, data, practice) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #1a5276; color: white; padding: 24px; border-radius: 8px 8px 0 0; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; }
    .content { background: #f9f9f9; padding: 24px; border: 1px solid #e0e0e0; }
    .section { margin-bottom: 20px; }
    .section h2 { color: #1a5276; font-size: 16px; margin-bottom: 8px; border-bottom: 2px solid #1a5276; padding-bottom: 4px; }
    .cta { display: inline-block; background: #1a5276; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 12px 0; }
    .checklist { list-style: none; padding: 0; }
    .checklist li { padding: 6px 0 6px 28px; position: relative; }
    .checklist li::before { content: "✓"; position: absolute; left: 4px; color: #1a5276; font-weight: bold; }
    .footer { background: #eee; padding: 16px 24px; border-radius: 0 0 8px 8px; font-size: 13px; color: #666; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${practice.practiceName}</h1>
    <p style="margin: 4px 0 0; font-size: 14px; opacity: 0.9;">Pain Management & Rehabilitation</p>
  </div>

  <div class="content">
    <div class="section">
      <p>Dear ${firstName},</p>
      <p>Thank you for choosing ${practice.practiceName} for your care. We've received your referral and our team will be reaching out shortly to schedule your appointment.</p>
    </div>

    <div class="section">
      <h2>📋 What to Expect</h2>
      <p>At your first visit, our specialists will conduct a thorough evaluation to understand your condition and develop a personalized treatment plan. We specialize in:</p>
      <ul>
        <li>Auto accident injuries & whiplash</li>
        <li>Personal injury rehabilitation</li>
        <li>Chronic pain management</li>
        <li>Interventional procedures</li>
        <li>Physical therapy & rehabilitation</li>
      </ul>
    </div>

    ${practice.bookingUrl ? `
    <div class="section" style="text-align: center;">
      <h2>📅 Schedule Your Appointment</h2>
      <p>You can book your appointment online for the fastest scheduling:</p>
      <a href="${practice.bookingUrl}" class="cta">Book My Appointment</a>
      <p style="font-size: 13px; color: #666;">Or wait for our team to call you — we'll reach out within 24 hours.</p>
    </div>
    ` : ''}

    <div class="section">
      <h2>📄 What to Bring</h2>
      <ul class="checklist">
        <li>Photo ID (driver's license or state ID)</li>
        <li>Insurance card(s) — front and back</li>
        <li>Referral paperwork (if you have a copy)</li>
        <li>Any imaging (X-rays, MRI results)</li>
        <li>Police report or accident report (if applicable)</li>
        <li>List of current medications</li>
        <li>Attorney information (if applicable)</li>
      </ul>
    </div>

    <div class="section">
      <h2>📍 Contact Us</h2>
      ${practice.practicePhone ? `<p>📞 <strong>${practice.practicePhone}</strong></p>` : ''}
      ${practice.practiceAddress ? `<p>📍 ${practice.practiceAddress}</p>` : ''}
    </div>

    <p>We look forward to helping you on your path to recovery.</p>
    <p>Warm regards,<br><strong>The ${practice.practiceName} Team</strong></p>
  </div>

  <div class="footer">
    <p>${practice.practiceName} ${practice.practiceAddress ? '| ' + practice.practiceAddress : ''} ${practice.practicePhone ? '| ' + practice.practicePhone : ''}</p>
    <p>This email was sent because a healthcare provider referred you to our practice.</p>
  </div>
</body>
</html>`;
}

// =============================================================================
// HELPER FUNCTIONS — Sheets data access
// =============================================================================

function getConfig(ss) {
  var configSheet = ss.getSheetByName(SHEET.CONFIG);
  var data = configSheet.getDataRange().getValues();
  var config = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) config[data[i][0]] = data[i][1];
  }
  return config;
}

function getActiveTeamNumbers(ss) {
  var teamSheet = ss.getSheetByName(SHEET.TEAM);
  var data = teamSheet.getDataRange().getValues();
  var numbers = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][2] === true || data[i][2] === 'TRUE') {
      numbers.push(data[i][1]);
    }
  }
  return numbers;
}

function countPending(ss) {
  var sheet = ss.getSheetByName(SHEET.REFERRALS);
  var data = sheet.getDataRange().getValues();
  var count = 0;
  for (var i = 1; i < data.length; i++) {
    if (data[i][COL.CALLED - 1] === false || data[i][COL.CALLED - 1] === 'FALSE' || data[i][COL.CALLED - 1] === '') {
      count++;
    }
  }
  return count;
}

function countCalledToday(ss) {
  var sheet = ss.getSheetByName(SHEET.REFERRALS);
  var data = sheet.getDataRange().getValues();
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var count = 0;
  for (var i = 1; i < data.length; i++) {
    var calledAt = data[i][COL.CALLED_AT - 1];
    if (calledAt && new Date(calledAt) >= today) {
      count++;
    }
  }
  return count;
}

function countBookedToday(ss) {
  var sheet = ss.getSheetByName(SHEET.REFERRALS);
  var data = sheet.getDataRange().getValues();
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var count = 0;
  for (var i = 1; i < data.length; i++) {
    var bookedAt = data[i][COL.BOOKED_AT - 1];
    if (bookedAt && new Date(bookedAt) >= today) {
      count++;
    }
  }
  return count;
}

function getStaleReferrals(ss, staleHours) {
  var sheet = ss.getSheetByName(SHEET.REFERRALS);
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var stale = [];

  for (var i = 1; i < data.length; i++) {
    var called = data[i][COL.CALLED - 1];
    var loggedAt = data[i][COL.LOGGED_AT - 1];

    if ((called === false || called === 'FALSE' || called === '') && loggedAt) {
      var loggedDate = new Date(loggedAt);
      var hoursElapsed = (now - loggedDate) / (1000 * 60 * 60);

      if (hoursElapsed >= staleHours) {
        stale.push({
          name: data[i][COL.PATIENT_NAME - 1] || 'Unknown',
          phone: data[i][COL.PHONE - 1] || 'No phone',
          complaint: data[i][COL.COMPLAINT - 1] || '',
          elapsed: formatElapsedHours(hoursElapsed),
          row: i + 1,
        });
      }
    }
  }

  return stale;
}

function formatElapsedHours(hours) {
  if (hours < 1) return Math.round(hours * 60) + 'm';
  if (hours < 24) return Math.round(hours) + 'h';
  var days = Math.floor(hours / 24);
  var remaining = Math.round(hours % 24);
  return days + 'd ' + remaining + 'h';
}

// =============================================================================
// TWILIO — Send WhatsApp messages
// =============================================================================

function sendWhatsApp(toNumber, message) {
  var url = 'https://api.twilio.com/2010-04-01/Accounts/' + CONFIG.TWILIO_SID + '/Messages.json';

  // Ensure whatsapp: prefix on both numbers
  var to = toNumber.indexOf('whatsapp:') === 0 ? toNumber : 'whatsapp:' + toNumber;

  var options = {
    method: 'post',
    headers: {
      'Authorization': 'Basic ' + Utilities.base64Encode(CONFIG.TWILIO_SID + ':' + CONFIG.TWILIO_TOKEN),
    },
    payload: {
      'To': to,
      'From': CONFIG.TWILIO_WHATSAPP_FROM,
      'Body': message,
    },
    muteHttpExceptions: true,
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();

    if (code >= 200 && code < 300) {
      var result = JSON.parse(response.getContentText());
      Logger.log('WhatsApp sent to ' + to + ' SID: ' + result.sid);
      return true;
    } else {
      var err = JSON.parse(response.getContentText());
      Logger.log('Twilio error ' + code + ' to ' + to + ': ' + (err.message || JSON.stringify(err)));
      return false;
    }
  } catch (err) {
    Logger.log('WhatsApp send failed to ' + to + ': ' + err.toString());
    return false;
  }
}

// =============================================================================
// LOGGING
// =============================================================================

function logEvent(event, details) {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var logSheet = ss.getSheetByName(SHEET.LOG);
    if (logSheet) {
      logSheet.appendRow([new Date(), event, details]);
    }
  } catch (e) {
    Logger.log('Log write failed: ' + e.toString());
  }
  Logger.log('[' + event + '] ' + details);
}

// =============================================================================
// CHECKBOX TIMESTAMP AUTOMATION
// When a team member checks "Called" or "Booked", auto-fill the timestamp.
// Install this as an onEdit trigger (see setup guide).
// =============================================================================

function onEdit(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET.REFERRALS) return;

  var col = e.range.getColumn();
  var row = e.range.getRow();
  if (row <= 1) return; // Skip header

  var now = new Date();

  // Column K (11) = Called checkbox → auto-fill Column L (12) with timestamp
  if (col === COL.CALLED && e.value === 'TRUE') {
    sheet.getRange(row, COL.CALLED_AT).setValue(now);
  }

  // Column N (14) = Booked checkbox → auto-fill Column O (15) with timestamp
  if (col === COL.BOOKED && e.value === 'TRUE') {
    sheet.getRange(row, COL.BOOKED_AT).setValue(now);
  }
}

// =============================================================================
// MANUAL TEST FUNCTIONS — Run from the Apps Script editor for debugging
// =============================================================================

function testReferralProcessing() {
  var testMessage = "Hey doc I have a referral for you. Maria Garcia, DOB 3/15/1980, " +
    "phone 786-555-1234, email maria.garcia@email.com. She was in a car accident last week, " +
    "neck and lower back pain. Lives in 33155. Diagnosis cervical strain and lumbar radiculopathy.";

  var payload = {
    postData: {
      type: 'application/json',
      contents: JSON.stringify({
        message: testMessage,
        sender: '+15559876543',
        timestamp: new Date().toISOString(),
      }),
    },
    parameter: {},
  };

  var result = doPost(payload);
  Logger.log('Test result: ' + result.getContent());
}

function testNotAReferral() {
  var payload = {
    postData: {
      type: 'application/json',
      contents: JSON.stringify({
        message: "Hey are you coming to the conference next week?",
        sender: '+15551112222',
      }),
    },
    parameter: {},
  };

  var result = doPost(payload);
  Logger.log('Test result: ' + result.getContent());
}

function testStaleCheck() {
  morningStaleCheck();
}
