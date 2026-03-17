// =============================================================================
// REFERRAL TRACKER — ADVANCED VERSION
// Google Apps Script — Paste into Extensions → Apps Script
//
// SETUP:
//   1. Fill in the CONFIG object below with your API keys and Sheet ID
//   2. Create the sheet tabs as described in SETUP-GUIDE.md
//   3. Deploy as Web App (Execute as: Me, Access: Anyone)
//   4. Set up 3 time triggers (see bottom of this file)
//   5. Done — iPhone Shortcut sends texts to your webhook URL
//
// CONFIGURABLE VIA GOOGLE SHEET:
//   - Team members (Team tab)
//   - Clinic locations (Clinics tab)
//   - All settings: SLAs, practice info, keywords (Config tab)
//   No code changes needed after initial setup.
// =============================================================================

// ── CREDENTIALS — The only things you edit in this file ───────────────────────
const CONFIG = {
  ANTHROPIC_API_KEY: 'YOUR_ANTHROPIC_API_KEY',       // https://console.anthropic.com/settings/keys
  TWILIO_SID:        'YOUR_TWILIO_ACCOUNT_SID',      // https://console.twilio.com
  TWILIO_TOKEN:      'YOUR_TWILIO_AUTH_TOKEN',        // https://console.twilio.com
  TWILIO_WHATSAPP:   'whatsapp:+14155238886',         // Sandbox default; swap for production number
  TWILIO_SMS:        '+1XXXXXXXXXX',                  // Your purchased Twilio number (for auto-reply)
  SPREADSHEET_ID:    'YOUR_SPREADSHEET_ID_HERE',      // From your Google Sheet URL
};

// ── SHEET TAB NAMES — Must match your spreadsheet exactly ─────────────────────
const SHEET = {
  REFERRALS: 'Referrals',
  TEAM:      'Team',
  CLINICS:   'Clinics',
  CONFIG:    'Config',
  LOG:       'Log',
  PENDING_REPLIES: 'PendingReplies',
};

// ── REFERRAL SHEET COLUMNS (1-based) ──────────────────────────────────────────
const C = {
  REF_ID:         1,   // A
  LOGGED_AT:      2,   // B
  TIER:           3,   // C
  PATIENT_NAME:   4,   // D
  PHONE:          5,   // E
  EMAIL:          6,   // F
  COMPLAINT:      7,   // G
  DIAGNOSIS:      8,   // H
  INJURY_TYPE:    9,   // I
  INSURANCE:     10,   // J
  ZIP:           11,   // K
  NEAREST_CLINIC:12,   // L
  REF_SOURCE:    13,   // M
  MISSING_INFO:  14,   // N
  EST_VALUE:     15,   // O
  STATUS:        16,   // P
  CLAIMED_BY:    17,   // Q
  ATTEMPTS:      18,   // R
  FOLLOW_UP:     19,   // S
  CALLED_AT:     20,   // T
  BOOKED:        21,   // U
  BOOKED_AT:     22,   // V
  NOTES:         23,   // W
  RAW_MESSAGE:   24,   // X
};

// ── TIER DEFINITIONS ──────────────────────────────────────────────────────────
const TIERS = {
  T1: { label: '🔴 URGENT',   sla_key: 'sla_t1_minutes', default_sla: 60,   est_key: 'est_value_t1', default_est: '$10K-$50K' },
  T2: { label: '🟠 PRIORITY', sla_key: 'sla_t2_minutes', default_sla: 240,  est_key: 'est_value_t2', default_est: '$5K-$20K'  },
  T3: { label: '🟡 STANDARD', sla_key: 'sla_t3_minutes', default_sla: 1440, est_key: 'est_value_t3', default_est: '$2K-$8K'   },
  T4: { label: '⚪ NEEDS INFO',sla_key: 'sla_t4_minutes', default_sla: 1440, est_key: 'est_value_t4', default_est: 'Unknown'   },
};

// ── STATUS OPTIONS ────────────────────────────────────────────────────────────
const STATUSES = {
  NEW:        'New',
  CLAIMED:    'Claimed',
  NO_ANSWER:  'No Answer',
  LEFT_VM:    'Left VM',
  SCHEDULING: 'Scheduling',
  CALLBACK:   'Callback Requested',
  BOOKED:     'Booked',
  DECLINED:   'Declined',
  NEEDS_INFO: 'Needs Info',
};

// =============================================================================
// WEBHOOK — iPhone Shortcut hits this endpoint
// =============================================================================

function doPost(e) {
  try {
    var payload;
    if (e.postData && e.postData.type === 'application/json') {
      payload = JSON.parse(e.postData.contents);
    } else if (e.parameter) {
      payload = e.parameter;
    } else {
      throw new Error('No payload received');
    }

    var rawMessage = (payload.message || payload.Body || '').trim();
    var sender     = (payload.sender  || payload.From || 'unknown').trim();

    if (!rawMessage) return jsonResp({ status: 'ignored', reason: 'empty message' });

    log('INCOMING', 'From: ' + sender + ' | Length: ' + rawMessage.length);

    // ── Step 1: AI analysis ──
    var analysis = analyzeWithAI(rawMessage, sender);
    if (!analysis.is_referral) {
      log('NOT_REFERRAL', sender + ': ' + analysis.reasoning);
      return jsonResp({ status: 'ignored', reason: 'not a referral', reasoning: analysis.reasoning });
    }

    // ── Step 2: Duplicate check ──
    var dupe = checkDuplicate(analysis);
    if (dupe) {
      log('DUPLICATE', 'Matches ' + dupe.refId + ' — ' + analysis.patient_name);
      return jsonResp({ status: 'duplicate', existing_ref: dupe.refId, patient: analysis.patient_name });
    }

    // ── Step 3: Match clinics ──
    var clinicInfo = matchClinics(analysis.zip_code, analysis.phone);

    // ── Step 4: Log to sheet ──
    var refId = addReferral(analysis, clinicInfo, sender, rawMessage);

    // ── Step 5: WhatsApp team blast ──
    notifyTeam(analysis, clinicInfo, refId);

    // ── Step 6: Welcome email (if email found) ──
    if (analysis.email && analysis.email !== 'N/A' && analysis.email.indexOf('@') > -1) {
      sendWelcomeEmail(analysis);
      log('WELCOME_EMAIL', analysis.email + ' for ' + analysis.patient_name);
    }

    // ── Step 7: Queue auto-reply to referral source (30-min delay) ──
    queueAutoReply(sender, analysis.patient_name, analysis.tier, analysis.referral_source);

    log('PROCESSED', refId + ' | ' + analysis.patient_name + ' | ' + analysis.tier);

    return jsonResp({
      status: 'processed',
      referral_id: refId,
      patient: analysis.patient_name,
      tier: analysis.tier,
    });

  } catch (err) {
    log('ERROR', err.toString() + '\n' + err.stack);
    return jsonResp({ status: 'error', message: err.toString() });
  }
}

function doGet() {
  return jsonResp({ status: 'ok', service: 'Referral Tracker Advanced', ts: new Date().toISOString() });
}

function jsonResp(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// =============================================================================
// AI ANALYSIS — Extract, classify, tier, detect insurance, flag missing info
// =============================================================================

function analyzeWithAI(rawMessage, sender) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var conf = getConf(ss);
  var clinicNames = getClinicNames(ss);

  var prompt = `You are a medical office referral intake AI for a Pain Management practice.

TASK: Analyze this text message. Determine if it's a real patient referral. If yes, extract all details and classify priority.

TEXT MESSAGE:
"""
${rawMessage}
"""
SENDER: ${sender}

PRACTICE CONTEXT:
- Specialties: car accidents (MVA), personal injury, workers comp, slip and fall, chronic pain
- Clinic locations: ${clinicNames.join(', ') || 'not specified'}

RESPOND WITH ONLY VALID JSON. No markdown, no backticks, no explanation:
{
  "is_referral": true/false,
  "reasoning": "one sentence why this is or isn't a referral",
  "patient_name": "First Last" or "N/A",
  "phone": "(XXX) XXX-XXXX" or "N/A",
  "email": "email@example.com" or "N/A",
  "complaint": "brief symptoms/reason" or "N/A",
  "diagnosis": "medical diagnosis if stated" or "N/A",
  "injury_type": "Car Accident" or "Personal Injury" or "Workers Comp" or "Slip and Fall" or "Chronic Pain" or "Other" or "N/A",
  "insurance": "carrier name" or "N/A",
  "zip_code": "XXXXX" or "N/A",
  "referral_source": "who sent it" or "N/A",
  "tier": "T1" or "T2" or "T3" or "T4",
  "tier_reasoning": "one sentence why this tier",
  "missing_info": ["list", "of", "missing", "fields"] or [],
  "attorney": "attorney name/firm" or "N/A",
  "urgency_signals": ["list of signals found"] or []
}

TIER RULES:
- T1 URGENT (call within 1h): Recent accident (<7 days), ER discharge, attorney involved, "ASAP"/"urgent"/"emergency", acute pain
- T2 PRIORITY (call within 4h): Accident within 30 days, has imaging/diagnosis, complete referral info, insurance verified
- T3 STANDARD (call within 24h): Chronic pain, no time pressure, vague complaint, older injury
- T4 NEEDS INFO (24h but flag owner): Missing phone number, can't identify patient, too vague to act on

EXTRACTION RULES:
- Format phone as (XXX) XXX-XXXX
- If message says "Doral" or "Hialeah" etc., infer zip code if possible
- Infer injury type from context: "MVA"/"wreck"/"crash" = Car Accident, "fell at work" = Workers Comp
- If any patient-specific detail exists (phone, name, email, complaint), lean toward is_referral: true
- missing_info should list: "phone", "email", "zip", "diagnosis", "insurance", "complaint", "name" — whichever are absent
- For insurance, catch: GEICO, State Farm, Allstate, Progressive, Medicare, Medicaid, workers comp, PIP, etc.`;

  var text = callClaude(prompt);

  try {
    var cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    log('AI_PARSE_ERROR', text.substring(0, 300));
    return {
      is_referral: true,
      reasoning: 'AI parse failed — logged as referral to be safe',
      patient_name: 'NEEDS REVIEW',
      phone: 'N/A', email: 'N/A', complaint: rawMessage.substring(0, 200),
      diagnosis: 'N/A', injury_type: 'N/A', insurance: 'N/A', zip_code: 'N/A',
      referral_source: sender, tier: 'T4', tier_reasoning: 'Parse failure — needs human review',
      missing_info: ['all — AI parse failed'], attorney: 'N/A', urgency_signals: [],
    };
  }
}

function callClaude(prompt) {
  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
    muteHttpExceptions: true,
  });

  var code = resp.getResponseCode();
  var body = JSON.parse(resp.getContentText());
  if (code !== 200) throw new Error('Claude API ' + code + ': ' + (body.error ? body.error.message : 'unknown'));
  return body.content[0].text;
}

// =============================================================================
// DUPLICATE DETECTION — Phone match against last 90 days
// =============================================================================

function checkDuplicate(analysis) {
  if (!analysis.phone || analysis.phone === 'N/A') return null;

  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET.REFERRALS);
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var ninetyDays = 90 * 24 * 60 * 60 * 1000;

  // Normalize: strip everything except digits
  var incomingDigits = analysis.phone.replace(/\D/g, '');
  if (incomingDigits.length > 10) incomingDigits = incomingDigits.slice(-10); // last 10

  for (var i = data.length - 1; i >= 1; i--) {
    var rowDate = data[i][C.LOGGED_AT - 1];
    if (!rowDate) continue;
    if ((now - new Date(rowDate)) > ninetyDays) continue;

    var rowPhone = (data[i][C.PHONE - 1] || '').toString().replace(/\D/g, '');
    if (rowPhone.length > 10) rowPhone = rowPhone.slice(-10);

    if (rowPhone && rowPhone === incomingDigits) {
      return { refId: data[i][C.REF_ID - 1], row: i + 1 };
    }
  }
  return null;
}

// =============================================================================
// CLINIC MATCHING — Zip code or area code → nearest clinics
// =============================================================================

function matchClinics(zipCode, phone) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var clinicSheet = ss.getSheetByName(SHEET.CLINICS);
  if (!clinicSheet) return { clinics: [], slots: [], method: 'none' };

  var data = clinicSheet.getDataRange().getValues();
  // Clinics sheet format: Name | Address | Zip | Area Codes (comma-sep) | Specialties | Is Default | Upcoming Slots
  // Row 1 = headers

  var allClinics = [];
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    allClinics.push({
      name:       data[i][0],
      address:    data[i][1] || '',
      zip:        (data[i][2] || '').toString().trim(),
      areaCodes:  (data[i][3] || '').toString().split(',').map(function(s){ return s.trim(); }),
      specialties: data[i][4] || '',
      isDefault:  data[i][5] === true || data[i][5] === 'TRUE',
      slots:      (data[i][6] || '').toString(),
    });
  }

  if (allClinics.length === 0) return { clinics: [], slots: [], method: 'none' };

  // Try zip code match first
  var cleanZip = (zipCode || '').toString().replace(/\D/g, '').substring(0, 5);
  if (cleanZip.length === 5) {
    var zipMatches = allClinics.filter(function(c) {
      return c.zip && Math.abs(parseInt(c.zip) - parseInt(cleanZip)) <= 15;
      // crude proximity: zips within ~15 of each other are likely nearby
    });
    zipMatches.sort(function(a, b) {
      return Math.abs(parseInt(a.zip) - parseInt(cleanZip)) - Math.abs(parseInt(b.zip) - parseInt(cleanZip));
    });
    if (zipMatches.length > 0) {
      return {
        clinics: zipMatches.slice(0, 3),
        method: 'zip',
      };
    }
  }

  // Try area code match
  var areaCode = '';
  if (phone && phone !== 'N/A') {
    var digits = phone.replace(/\D/g, '');
    if (digits.length >= 10) {
      areaCode = digits.length === 11 ? digits.substring(1, 4) : digits.substring(0, 3);
    }
  }
  if (areaCode) {
    var areaMatches = allClinics.filter(function(c) {
      return c.areaCodes.indexOf(areaCode) > -1;
    });
    if (areaMatches.length > 0) {
      return { clinics: areaMatches.slice(0, 3), method: 'area_code' };
    }
  }

  // Fallback: default/common clinics
  var defaults = allClinics.filter(function(c) { return c.isDefault; });
  if (defaults.length === 0) defaults = allClinics;
  return { clinics: defaults.slice(0, 3), method: 'default' };
}

function getClinicNames(ss) {
  var clinicSheet = ss.getSheetByName(SHEET.CLINICS);
  if (!clinicSheet) return [];
  var data = clinicSheet.getDataRange().getValues();
  var names = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) names.push(data[i][0]);
  }
  return names;
}

// =============================================================================
// REFERRAL LOGGING — Add row to Google Sheet
// =============================================================================

function addReferral(data, clinicInfo, sender, rawMessage) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET.REFERRALS);
  var conf = getConf(ss);
  var now = new Date();

  var lastRow = sheet.getLastRow();
  var seq = lastRow; // row 1 = headers
  var refId = 'REF-' + ('0000' + seq).slice(-4);

  var tierInfo = TIERS[data.tier] || TIERS.T3;
  var estValue = conf[tierInfo.est_key] || tierInfo.default_est;

  var source = (data.referral_source && data.referral_source !== 'N/A')
    ? data.referral_source : sender;

  var clinicNames = clinicInfo.clinics.map(function(c) { return c.name; }).join(', ');
  var missingStr = (data.missing_info && data.missing_info.length > 0)
    ? data.missing_info.join(', ') : '';

  var row = new Array(C.RAW_MESSAGE); // size to last column
  row[C.REF_ID - 1]        = refId;
  row[C.LOGGED_AT - 1]     = now;
  row[C.TIER - 1]          = data.tier;
  row[C.PATIENT_NAME - 1]  = val(data.patient_name);
  row[C.PHONE - 1]         = val(data.phone);
  row[C.EMAIL - 1]         = val(data.email);
  row[C.COMPLAINT - 1]     = val(data.complaint);
  row[C.DIAGNOSIS - 1]     = val(data.diagnosis);
  row[C.INJURY_TYPE - 1]   = val(data.injury_type);
  row[C.INSURANCE - 1]     = val(data.insurance);
  row[C.ZIP - 1]           = val(data.zip_code);
  row[C.NEAREST_CLINIC - 1]= clinicNames;
  row[C.REF_SOURCE - 1]    = source;
  row[C.MISSING_INFO - 1]  = missingStr;
  row[C.EST_VALUE - 1]     = estValue;
  row[C.STATUS - 1]        = data.tier === 'T4' ? STATUSES.NEEDS_INFO : STATUSES.NEW;
  row[C.CLAIMED_BY - 1]    = '';
  row[C.ATTEMPTS - 1]      = 0;
  row[C.FOLLOW_UP - 1]     = '';
  row[C.CALLED_AT - 1]     = '';
  row[C.BOOKED - 1]        = false;
  row[C.BOOKED_AT - 1]     = '';
  row[C.NOTES - 1]         = '';
  row[C.RAW_MESSAGE - 1]   = rawMessage;

  sheet.appendRow(row);

  // Insert checkbox for Booked column
  var newRow = lastRow + 1;
  sheet.getRange(newRow, C.BOOKED).insertCheckboxes();

  // Apply data validation for Status column
  var statusValues = Object.values(STATUSES);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(statusValues, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(newRow, C.STATUS).setDataValidation(rule);

  return refId;
}

function val(v) { return (v && v !== 'N/A') ? v : ''; }

// =============================================================================
// WHATSAPP — Team notification for new referral
// =============================================================================

function notifyTeam(data, clinicInfo, refId) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var conf = getConf(ss);
  var teamNumbers = getActiveTeam(ss);

  var tierInfo = TIERS[data.tier] || TIERS.T3;
  var slaMinutes = parseInt(conf[tierInfo.sla_key]) || tierInfo.default_sla;
  var slaLabel = slaMinutes < 60 ? slaMinutes + ' min' :
                 slaMinutes < 1440 ? Math.round(slaMinutes / 60) + ' hour' + (slaMinutes >= 120 ? 's' : '') :
                 Math.round(slaMinutes / 1440) + ' day';

  var pending = getPendingStats(ss);
  var staleList = getStaleReferrals(ss);
  var sheetUrl = conf.sheet_url || '';

  // Build message
  var msg = tierInfo.label + ' — NEW REFERRAL (#' + refId + ')\n';
  msg += '   Call within ' + slaLabel + '\n\n';

  msg += '👤 ' + (data.patient_name || 'Unknown') + '\n';
  if (data.phone && data.phone !== 'N/A') msg += '📞 ' + data.phone + '\n';
  if (data.email && data.email !== 'N/A') msg += '📧 ' + data.email + '\n';
  if (data.complaint && data.complaint !== 'N/A') msg += '💬 ' + data.complaint + '\n';
  if (data.injury_type && data.injury_type !== 'N/A') msg += '🏷️ ' + data.injury_type;
  if (data.diagnosis && data.diagnosis !== 'N/A') msg += ' | ' + data.diagnosis;
  if (data.injury_type && data.injury_type !== 'N/A') msg += '\n';
  if (data.attorney && data.attorney !== 'N/A') msg += '⚖️ Attorney: ' + data.attorney + '\n';
  if (data.insurance && data.insurance !== 'N/A') msg += '💳 Insurance: ' + data.insurance + '\n';
  if (data.zip_code && data.zip_code !== 'N/A') msg += '📍 ' + data.zip_code + '\n';

  // Missing info warning
  if (data.missing_info && data.missing_info.length > 0) {
    msg += '\n⚠️ Missing: ' + data.missing_info.join(', ') + '\n';
  }

  // Clinics
  if (clinicInfo.clinics.length > 0) {
    var methodNote = clinicInfo.method === 'zip' ? '' :
                     clinicInfo.method === 'area_code' ? ' (by area code)' : ' (common locations)';
    msg += '\n🏥 Clinics' + methodNote + ':\n';
    for (var i = 0; i < clinicInfo.clinics.length; i++) {
      msg += '   ' + (i + 1) + '. ' + clinicInfo.clinics[i].name;
      if (clinicInfo.clinics[i].address) msg += ' — ' + clinicInfo.clinics[i].address;
      msg += '\n';
    }

    // Slots
    var hasSlots = false;
    for (var j = 0; j < clinicInfo.clinics.length; j++) {
      if (clinicInfo.clinics[j].slots) { hasSlots = true; break; }
    }
    if (hasSlots) {
      msg += '\n📅 Next available (48h):\n';
      for (var k = 0; k < clinicInfo.clinics.length; k++) {
        if (clinicInfo.clinics[k].slots) {
          var slots = clinicInfo.clinics[k].slots.split(';');
          for (var s = 0; s < slots.length && s < 2; s++) {
            msg += '   • ' + slots[s].trim() + ' (' + clinicInfo.clinics[k].name + ')\n';
          }
        }
      }
    }
  }

  // Pending stats
  msg += '\n📋 Pending: ' + pending.total;
  if (pending.t1 > 0 || pending.t2 > 0 || pending.t3 > 0) {
    msg += ' (';
    var parts = [];
    if (pending.t1 > 0) parts.push(pending.t1 + '🔴');
    if (pending.t2 > 0) parts.push(pending.t2 + '🟠');
    if (pending.t3 > 0) parts.push(pending.t3 + '🟡');
    if (pending.t4 > 0) parts.push(pending.t4 + '⚪');
    msg += parts.join(' ') + ')';
  }

  // Stale warning
  if (staleList.length > 0) {
    msg += '\n\n🚨 Stale:\n';
    for (var q = 0; q < Math.min(staleList.length, 3); q++) {
      msg += '   • ' + staleList[q].name + ' — ' + staleList[q].elapsed + ' overdue\n';
    }
  }

  if (sheetUrl) msg += '\n🔗 ' + sheetUrl;

  // Send to all active team members + owner
  for (var t = 0; t < teamNumbers.length; t++) {
    sendWhatsApp(teamNumbers[t], msg);
  }
  if (conf.owner_number) sendWhatsApp(conf.owner_number, msg);
}

// =============================================================================
// AUTO-REPLY — Queued for ~30 min delay, feels humanistic
// =============================================================================

function queueAutoReply(senderNumber, patientName, tier, sourceName) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var replySheet = ss.getSheetByName(SHEET.PENDING_REPLIES);
  if (!replySheet) {
    // Create the sheet if it doesn't exist
    replySheet = ss.insertSheet(SHEET.PENDING_REPLIES);
    replySheet.appendRow(['Sender', 'Patient Name', 'Tier', 'Source Name', 'Queued At', 'Send After', 'Sent']);
  }

  var now = new Date();
  // Random delay between 15-35 minutes
  var delayMs = (15 + Math.floor(Math.random() * 20)) * 60 * 1000;
  var sendAfter = new Date(now.getTime() + delayMs);

  replySheet.appendRow([senderNumber, patientName, tier, sourceName || '', now, sendAfter, 'NO']);
}

function processAutoReplies() {
  // Called by a time trigger every 5 minutes
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var replySheet = ss.getSheetByName(SHEET.PENDING_REPLIES);
  if (!replySheet) return;

  var conf = getConf(ss);
  var data = replySheet.getDataRange().getValues();
  var now = new Date();

  for (var i = 1; i < data.length; i++) {
    if (data[i][6] === 'YES') continue; // already sent

    var sendAfter = new Date(data[i][5]);
    if (now < sendAfter) continue; // not time yet

    var senderNumber = data[i][0];
    var patientName  = data[i][1];
    var tier         = data[i][2];
    var sourceName   = data[i][3];

    var tierInfo = TIERS[tier] || TIERS.T3;
    var slaMinutes = parseInt(conf[tierInfo.sla_key]) || tierInfo.default_sla;
    var timeframe = slaMinutes <= 60 ? 'within the hour' :
                    slaMinutes <= 240 ? 'shortly' :
                    'within the next day';

    // Pick a natural-sounding reply variation
    var templates = [
      'Hey{source} — got it, {patient} is in our system. Team will be reaching out {timeframe}. Thanks for thinking of us, really appreciate it!',
      'Got it{source}! {patient} has been logged and our team will reach out {timeframe}. Thanks for the referral, we\'ll take great care of them.',
      'Thanks{source}! We\'ve got {patient} — team will be calling {timeframe}. Appreciate you sending them our way!',
    ];
    var template = templates[Math.floor(Math.random() * templates.length)];

    var sourceTag = sourceName && sourceName !== 'N/A' ? ' ' + sourceName : '';
    var reply = template
      .replace('{source}', sourceTag ? ',' + sourceTag : '')
      .replace('{patient}', patientName || 'your referral')
      .replace('{timeframe}', timeframe);

    // Send via SMS (since referrals come in as texts, reply as text)
    sendSMS(senderNumber, reply);

    // Mark as sent
    replySheet.getRange(i + 1, 7).setValue('YES');
    log('AUTO_REPLY', 'To: ' + senderNumber + ' | ' + patientName);
  }
}

// =============================================================================
// STALE CHECKS — Morning (9 AM) + Afternoon (4 PM), tier-aware SLAs
// =============================================================================

function morningStaleCheck()   { runStaleCheck('MORNING'); }
function afternoonStaleCheck() { runStaleCheck('AFTERNOON'); }

function runStaleCheck(period) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var conf = getConf(ss);
  var staleList = getStaleReferrals(ss);
  var pending = getPendingStats(ss);
  var todayStats = getTodayStats(ss);
  var sheetUrl = conf.sheet_url || '';

  var emoji = period === 'MORNING' ? '☀️' : '🌆';

  var msg = emoji + ' *' + period + ' REFERRAL CHECK*\n\n';
  msg += '📊 *Status:*\n';

  if (period === 'MORNING') {
    msg += '   ✅ Called yesterday: ' + todayStats.calledYesterday + '\n';
    msg += '   📅 Booked yesterday: ' + todayStats.bookedYesterday + '\n';
  } else {
    msg += '   ✅ Called today: ' + todayStats.calledToday + '\n';
    msg += '   📅 Booked today: ' + todayStats.bookedToday + '\n';
  }
  msg += '   ⏳ Pending: ' + pending.total + '\n';

  if (staleList.length > 0) {
    // Calculate total at-risk revenue
    var totalRisk = staleList.map(function(s) { return s.estValue; }).join(' + ');

    msg += '\n🚨 *OVERDUE (past SLA):*\n';
    for (var i = 0; i < staleList.length; i++) {
      var s = staleList[i];
      msg += '   ' + TIERS[s.tier].label.split(' ')[0] + ' ' + s.name + ' — ' + s.phone + '\n';
      msg += '      ' + (s.complaint || 'No complaint listed') + '\n';
      msg += '      Logged ' + s.elapsed + ' ago (SLA: ' + s.slaLabel + ') ⚠️';
      if (s.attempts > 0) msg += ' | ' + s.attempts + ' attempts';
      msg += '\n';
    }
    msg += '\n💰 *At-risk revenue:* ' + totalRisk + '\n';
    msg += '\n⚠️ These need attention NOW.';

    // Owner escalation: T1s overdue by 2x SLA
    var ownerAlerts = staleList.filter(function(s) {
      return s.tier === 'T1' && s.minutesOverdue >= (s.slaMinutes * 2);
    });
    if (ownerAlerts.length > 0 && conf.owner_number) {
      var escalation = '🚨🚨 *ESCALATION — T1 REFERRALS SEVERELY OVERDUE*\n\n';
      for (var j = 0; j < ownerAlerts.length; j++) {
        escalation += '🔴 ' + ownerAlerts[j].name + ' — ' + ownerAlerts[j].phone + '\n';
        escalation += '   ' + ownerAlerts[j].elapsed + ' overdue (SLA was ' + ownerAlerts[j].slaLabel + ')\n';
      }
      escalation += '\nDirect intervention needed.';
      if (sheetUrl) escalation += '\n🔗 ' + sheetUrl;
      sendWhatsApp(conf.owner_number, escalation);
    }

  } else {
    msg += '\n✅ *No overdue referrals.* All caught up!';
  }

  // Needs-info referrals (T4 flagged to owner)
  var needsInfo = getNeedsInfoReferrals(ss);
  if (needsInfo.length > 0) {
    msg += '\n\n⚪ *Needs YOUR follow-up:*\n';
    for (var k = 0; k < needsInfo.length; k++) {
      msg += '   • ' + needsInfo[k].name + ' — ' + needsInfo[k].missing + '\n';
    }
  }

  if (sheetUrl) msg += '\n🔗 ' + sheetUrl;

  // Send to team + owner
  var teamNumbers = getActiveTeam(ss);
  for (var t = 0; t < teamNumbers.length; t++) {
    sendWhatsApp(teamNumbers[t], msg);
  }
  if (conf.owner_number) sendWhatsApp(conf.owner_number, msg);

  log('STALE_CHECK', period + ' | Pending: ' + pending.total + ' | Stale: ' + staleList.length);
}

// =============================================================================
// WELCOME EMAIL
// =============================================================================

function sendWelcomeEmail(data) {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var conf = getConf(ss);

  var practiceName = conf.practice_name || 'Our Practice';
  var firstName = (data.patient_name || 'there').split(' ')[0];

  var subject = 'Welcome to ' + practiceName + ' — Your Appointment Information';

  var body = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
body{font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}
.header{background:#1a5276;color:#fff;padding:24px;border-radius:8px 8px 0 0;text-align:center}
.header h1{margin:0;font-size:22px}
.content{background:#f9f9f9;padding:24px;border:1px solid #e0e0e0}
.section{margin-bottom:20px}
.section h2{color:#1a5276;font-size:16px;border-bottom:2px solid #1a5276;padding-bottom:4px}
.cta{display:inline-block;background:#1a5276;color:#fff;padding:12px 32px;text-decoration:none;border-radius:6px;font-weight:bold;margin:12px 0}
.checklist{list-style:none;padding:0}
.checklist li{padding:6px 0 6px 28px;position:relative}
.checklist li::before{content:"✓";position:absolute;left:4px;color:#1a5276;font-weight:bold}
.footer{background:#eee;padding:16px 24px;border-radius:0 0 8px 8px;font-size:13px;color:#666;text-align:center}
</style></head><body>
<div class="header"><h1>${practiceName}</h1><p style="margin:4px 0 0;font-size:14px;opacity:0.9">Pain Management & Rehabilitation</p></div>
<div class="content">
<div class="section"><p>Dear ${firstName},</p>
<p>We know dealing with pain can be overwhelming — our team is here to help you feel better, and we'll guide you through every step. We've received your referral and someone from our team will be reaching out shortly to schedule your appointment.</p></div>
<div class="section"><h2>📋 What to Expect</h2>
<p>At your first visit, our specialists will conduct a thorough evaluation and build a personalized treatment plan with you. We specialize in:</p>
<ul><li>Auto accident injuries & whiplash</li><li>Personal injury rehabilitation</li><li>Chronic pain management</li><li>Interventional procedures</li><li>Physical therapy & rehabilitation</li></ul></div>
${conf.booking_url ? '<div class="section" style="text-align:center"><h2>📅 Schedule Your Appointment</h2><p>Book online for the fastest scheduling:</p><a href="' + conf.booking_url + '" class="cta">Book My Appointment</a><p style="font-size:13px;color:#666">Or wait for our call — we\'ll reach out soon.</p></div>' : ''}
<div class="section"><h2>📄 What to Bring</h2>
<ul class="checklist"><li>Photo ID (driver's license or state ID)</li><li>Insurance card(s) — front and back</li><li>Referral paperwork (if you have a copy)</li><li>Any imaging (X-rays, MRI results)</li><li>Police report or accident report (if applicable)</li><li>List of current medications</li><li>Attorney information (if applicable)</li></ul></div>
<div class="section"><h2>📍 Contact Us</h2>
${conf.practice_phone ? '<p>📞 <strong>' + conf.practice_phone + '</strong></p>' : ''}
${conf.practice_address ? '<p>📍 ' + conf.practice_address + '</p>' : ''}</div>
<p>We look forward to helping you on your path to recovery.</p>
<p>Warm regards,<br><strong>The ${practiceName} Team</strong></p></div>
<div class="footer"><p>${practiceName} ${conf.practice_address ? '| ' + conf.practice_address : ''} ${conf.practice_phone ? '| ' + conf.practice_phone : ''}</p>
<p>This email was sent because a healthcare provider referred you to our practice.</p></div>
</body></html>`;

  try {
    GmailApp.sendEmail(data.email, subject, '', { htmlBody: body, name: practiceName });
  } catch (err) {
    log('EMAIL_ERROR', data.email + ': ' + err.toString());
  }
}

// =============================================================================
// onEdit — Auto-timestamps, status tracking, attempt counting
// =============================================================================

function onEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET.REFERRALS) return;

  var col = e.range.getColumn();
  var row = e.range.getRow();
  if (row <= 1) return;

  var now = new Date();

  // Status changed
  if (col === C.STATUS) {
    var newStatus = e.value;

    // If status moved to something that implies a call attempt, increment counter
    var callStatuses = [STATUSES.NO_ANSWER, STATUSES.LEFT_VM, STATUSES.SCHEDULING, STATUSES.CALLBACK, STATUSES.BOOKED, STATUSES.DECLINED];
    if (callStatuses.indexOf(newStatus) > -1) {
      var currentAttempts = sheet.getRange(row, C.ATTEMPTS).getValue() || 0;
      sheet.getRange(row, C.ATTEMPTS).setValue(currentAttempts + 1);
    }

    // If status is "Booked", fill Called At (if empty) and Booked At
    if (newStatus === STATUSES.BOOKED) {
      if (!sheet.getRange(row, C.CALLED_AT).getValue()) {
        sheet.getRange(row, C.CALLED_AT).setValue(now);
      }
      sheet.getRange(row, C.BOOKED).setValue(true);
      sheet.getRange(row, C.BOOKED_AT).setValue(now);
    }

    // If a call-attempt status, fill Called At on first attempt
    if ([STATUSES.NO_ANSWER, STATUSES.LEFT_VM, STATUSES.SCHEDULING, STATUSES.CALLBACK].indexOf(newStatus) > -1) {
      if (!sheet.getRange(row, C.CALLED_AT).getValue()) {
        sheet.getRange(row, C.CALLED_AT).setValue(now);
      }
    }

    // If "Callback Requested", set follow-up to tomorrow
    if (newStatus === STATUSES.CALLBACK) {
      var tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      sheet.getRange(row, C.FOLLOW_UP).setValue(tomorrow);
    }
  }

  // Claimed By changed (someone typed their name)
  if (col === C.CLAIMED_BY && e.value) {
    // Auto-set status to Claimed if still New
    var currentStatus = sheet.getRange(row, C.STATUS).getValue();
    if (currentStatus === STATUSES.NEW) {
      sheet.getRange(row, C.STATUS).setValue(STATUSES.CLAIMED);
    }
  }

  // Booked checkbox toggled
  if (col === C.BOOKED && e.value === 'TRUE') {
    sheet.getRange(row, C.BOOKED_AT).setValue(now);
    sheet.getRange(row, C.STATUS).setValue(STATUSES.BOOKED);
  }
}

// =============================================================================
// DATA HELPERS
// =============================================================================

function getConf(ss) {
  var sheet = ss.getSheetByName(SHEET.CONFIG);
  var data = sheet.getDataRange().getValues();
  var c = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) c[data[i][0]] = data[i][1];
  }
  return c;
}

function getActiveTeam(ss) {
  var sheet = ss.getSheetByName(SHEET.TEAM);
  var data = sheet.getDataRange().getValues();
  var nums = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][2] === true || data[i][2] === 'TRUE') nums.push(data[i][1]);
  }
  return nums;
}

function getPendingStats(ss) {
  var sheet = ss.getSheetByName(SHEET.REFERRALS);
  var data = sheet.getDataRange().getValues();
  var stats = { total: 0, t1: 0, t2: 0, t3: 0, t4: 0 };

  for (var i = 1; i < data.length; i++) {
    var status = data[i][C.STATUS - 1];
    if (status === STATUSES.BOOKED || status === STATUSES.DECLINED) continue;
    if (status === '' && data[i][C.BOOKED - 1] === true) continue;

    stats.total++;
    var tier = data[i][C.TIER - 1] || 'T3';
    if (tier === 'T1') stats.t1++;
    else if (tier === 'T2') stats.t2++;
    else if (tier === 'T3') stats.t3++;
    else if (tier === 'T4') stats.t4++;
  }
  return stats;
}

function getStaleReferrals(ss) {
  var conf = getConf(ss);
  var sheet = ss.getSheetByName(SHEET.REFERRALS);
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var stale = [];

  for (var i = 1; i < data.length; i++) {
    var status = data[i][C.STATUS - 1];
    // Stale = not yet Booked or Declined, and past SLA
    if (status === STATUSES.BOOKED || status === STATUSES.DECLINED) continue;

    var loggedAt = data[i][C.LOGGED_AT - 1];
    if (!loggedAt) continue;

    var tier = data[i][C.TIER - 1] || 'T3';
    var tierInfo = TIERS[tier] || TIERS.T3;
    var slaMinutes = parseInt(conf[tierInfo.sla_key]) || tierInfo.default_sla;
    var minutesElapsed = (now - new Date(loggedAt)) / (1000 * 60);

    if (minutesElapsed >= slaMinutes) {
      var estValue = conf[tierInfo.est_key] || tierInfo.default_est;
      stale.push({
        name: data[i][C.PATIENT_NAME - 1] || 'Unknown',
        phone: data[i][C.PHONE - 1] || 'No phone',
        complaint: data[i][C.COMPLAINT - 1] || '',
        tier: tier,
        slaMinutes: slaMinutes,
        slaLabel: slaMinutes < 60 ? slaMinutes + 'min' : Math.round(slaMinutes / 60) + 'h',
        elapsed: formatElapsed(minutesElapsed),
        minutesOverdue: minutesElapsed - slaMinutes,
        attempts: data[i][C.ATTEMPTS - 1] || 0,
        estValue: estValue,
        row: i + 1,
      });
    }
  }

  // Sort: T1 first, then by time overdue
  stale.sort(function(a, b) {
    var tierOrder = { T1: 0, T2: 1, T3: 2, T4: 3 };
    return (tierOrder[a.tier] || 3) - (tierOrder[b.tier] || 3) || b.minutesOverdue - a.minutesOverdue;
  });

  return stale;
}

function getNeedsInfoReferrals(ss) {
  var sheet = ss.getSheetByName(SHEET.REFERRALS);
  var data = sheet.getDataRange().getValues();
  var results = [];

  for (var i = 1; i < data.length; i++) {
    if (data[i][C.TIER - 1] === 'T4' && data[i][C.STATUS - 1] !== STATUSES.BOOKED && data[i][C.STATUS - 1] !== STATUSES.DECLINED) {
      results.push({
        name: data[i][C.PATIENT_NAME - 1] || 'Unknown',
        missing: data[i][C.MISSING_INFO - 1] || 'unknown details',
      });
    }
  }
  return results;
}

function getTodayStats(ss) {
  var sheet = ss.getSheetByName(SHEET.REFERRALS);
  var data = sheet.getDataRange().getValues();
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  var stats = { calledToday: 0, bookedToday: 0, calledYesterday: 0, bookedYesterday: 0 };

  for (var i = 1; i < data.length; i++) {
    var calledAt = data[i][C.CALLED_AT - 1];
    var bookedAt = data[i][C.BOOKED_AT - 1];

    if (calledAt) {
      var cd = new Date(calledAt);
      if (cd >= today) stats.calledToday++;
      else if (cd >= yesterday && cd < today) stats.calledYesterday++;
    }
    if (bookedAt) {
      var bd = new Date(bookedAt);
      if (bd >= today) stats.bookedToday++;
      else if (bd >= yesterday && bd < today) stats.bookedYesterday++;
    }
  }
  return stats;
}

function formatElapsed(minutes) {
  if (minutes < 60) return Math.round(minutes) + 'm';
  if (minutes < 1440) {
    var h = Math.floor(minutes / 60);
    var m = Math.round(minutes % 60);
    return h + 'h ' + m + 'm';
  }
  var d = Math.floor(minutes / 1440);
  var rh = Math.round((minutes % 1440) / 60);
  return d + 'd ' + rh + 'h';
}

// =============================================================================
// TWILIO MESSAGING
// =============================================================================

function sendWhatsApp(to, message) {
  var toNum = to.indexOf('whatsapp:') === 0 ? to : 'whatsapp:' + to;
  return sendTwilio(toNum, CONFIG.TWILIO_WHATSAPP, message);
}

function sendSMS(to, message) {
  return sendTwilio(to, CONFIG.TWILIO_SMS, message);
}

function sendTwilio(to, from, body) {
  var url = 'https://api.twilio.com/2010-04-01/Accounts/' + CONFIG.TWILIO_SID + '/Messages.json';
  try {
    var resp = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: { 'Authorization': 'Basic ' + Utilities.base64Encode(CONFIG.TWILIO_SID + ':' + CONFIG.TWILIO_TOKEN) },
      payload: { To: to, From: from, Body: body },
      muteHttpExceptions: true,
    });
    var code = resp.getResponseCode();
    if (code >= 200 && code < 300) {
      Logger.log('Sent to ' + to);
      return true;
    }
    var err = JSON.parse(resp.getContentText());
    Logger.log('Twilio ' + code + ' → ' + to + ': ' + (err.message || ''));
    return false;
  } catch (err) {
    Logger.log('Twilio fail → ' + to + ': ' + err);
    return false;
  }
}

// =============================================================================
// LOGGING
// =============================================================================

function log(event, details) {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET.LOG);
    if (sheet) sheet.appendRow([new Date(), event, details]);
  } catch (e) { /* silent */ }
  Logger.log('[' + event + '] ' + details);
}

// =============================================================================
// SETUP HELPER — Run once to create all sheets with correct headers
// =============================================================================

function setupSheets() {
  var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  // Referrals sheet
  var ref = ss.getSheetByName(SHEET.REFERRALS) || ss.insertSheet(SHEET.REFERRALS);
  if (ref.getLastRow() === 0) {
    ref.appendRow([
      'Referral ID', 'Logged At', 'Tier', 'Patient Name', 'Phone', 'Email',
      'Complaint', 'Diagnosis', 'Injury Type', 'Insurance', 'Zip', 'Nearest Clinic',
      'Referral Source', 'Missing Info', 'Est. Value', 'Status', 'Claimed By',
      'Attempts', 'Follow Up', 'Called At', 'Booked ☐', 'Booked At', 'Notes', 'Raw Message'
    ]);
    ref.setFrozenRows(1);
    ref.getRange(1, 1, 1, C.RAW_MESSAGE).setFontWeight('bold');
  }

  // Team sheet
  var team = ss.getSheetByName(SHEET.TEAM) || ss.insertSheet(SHEET.TEAM);
  if (team.getLastRow() === 0) {
    team.appendRow(['Name', 'WhatsApp Number', 'Active']);
    team.setFrozenRows(1);
    team.getRange(1, 1, 1, 3).setFontWeight('bold');
  }

  // Clinics sheet
  var clinics = ss.getSheetByName(SHEET.CLINICS) || ss.insertSheet(SHEET.CLINICS);
  if (clinics.getLastRow() === 0) {
    clinics.appendRow(['Clinic Name', 'Address', 'Zip', 'Area Codes', 'Specialties', 'Is Default', 'Upcoming Slots']);
    clinics.setFrozenRows(1);
    clinics.getRange(1, 1, 1, 7).setFontWeight('bold');
  }

  // Config sheet
  var config = ss.getSheetByName(SHEET.CONFIG) || ss.insertSheet(SHEET.CONFIG);
  if (config.getLastRow() === 0) {
    var defaults = [
      ['Setting', 'Value'],
      ['owner_number', '+1XXXXXXXXXX'],
      ['practice_name', 'Your Practice Name Pain Management'],
      ['practice_phone', '(555) 000-0000'],
      ['practice_address', '123 Main St, City, FL 33XXX'],
      ['booking_url', 'https://your-booking-link.com'],
      ['welcome_email_from', 'yourname@gmail.com'],
      ['sheet_url', '(paste the full URL of this Google Sheet here)'],
      ['sla_t1_minutes', '60'],
      ['sla_t2_minutes', '240'],
      ['sla_t3_minutes', '1440'],
      ['sla_t4_minutes', '1440'],
      ['est_value_t1', '$10K-$50K'],
      ['est_value_t2', '$5K-$20K'],
      ['est_value_t3', '$2K-$8K'],
      ['est_value_t4', 'Unknown'],
    ];
    for (var i = 0; i < defaults.length; i++) {
      config.appendRow(defaults[i]);
    }
    config.setFrozenRows(1);
    config.getRange(1, 1, 1, 2).setFontWeight('bold');
  }

  // Log sheet
  var logSheet = ss.getSheetByName(SHEET.LOG) || ss.insertSheet(SHEET.LOG);
  if (logSheet.getLastRow() === 0) {
    logSheet.appendRow(['Timestamp', 'Event', 'Details']);
    logSheet.setFrozenRows(1);
    logSheet.getRange(1, 1, 1, 3).setFontWeight('bold');
  }

  // PendingReplies sheet
  var replies = ss.getSheetByName(SHEET.PENDING_REPLIES) || ss.insertSheet(SHEET.PENDING_REPLIES);
  if (replies.getLastRow() === 0) {
    replies.appendRow(['Sender', 'Patient Name', 'Tier', 'Source Name', 'Queued At', 'Send After', 'Sent']);
    replies.setFrozenRows(1);
    replies.getRange(1, 1, 1, 7).setFontWeight('bold');
  }

  Logger.log('All sheets created with headers. Fill in Team, Clinics, and Config tabs, then deploy.');
}

// =============================================================================
// TEST FUNCTIONS — Run from the script editor to verify
// =============================================================================

function testFullReferral() {
  var payload = {
    postData: {
      type: 'application/json',
      contents: JSON.stringify({
        message: "Hey got a referral for you. Maria Garcia 786-555-1234 maria.garcia@email.com car accident last Thursday, neck and back pain. She lives in Doral area 33178. Cervical strain, lumbar radiculopathy. Attorney is Smith & Associates. She needs to be seen ASAP.",
        sender: '+15559876543',
      }),
    },
    parameter: {},
  };
  var result = doPost(payload);
  Logger.log('Result: ' + result.getContent());
}

function testSparseReferral() {
  var payload = {
    postData: {
      type: 'application/json',
      contents: JSON.stringify({
        message: "hey bro got a patient for you. James Wilson 305-555-6789. car accident, back and knee pain. needs to be seen this week if possible",
        sender: '+15551112222',
      }),
    },
    parameter: {},
  };
  var result = doPost(payload);
  Logger.log('Result: ' + result.getContent());
}

function testNotAReferral() {
  var payload = {
    postData: {
      type: 'application/json',
      contents: JSON.stringify({
        message: "Hey are we still on for golf Saturday? Bring the referral forms btw",
        sender: '+15553334444',
      }),
    },
    parameter: {},
  };
  var result = doPost(payload);
  Logger.log('Result: ' + result.getContent());
}

function testStaleCheck() { morningStaleCheck(); }
function testAutoReplies() { processAutoReplies(); }

// =============================================================================
// TRIGGER SETUP INSTRUCTIONS
// Run setupTriggers() ONCE from the script editor to create all 3 time triggers.
// =============================================================================

function setupTriggers() {
  // Clear existing triggers to avoid duplicates
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    var name = existing[i].getHandlerFunction();
    if (['morningStaleCheck', 'afternoonStaleCheck', 'processAutoReplies'].indexOf(name) > -1) {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }

  // Morning stale check: 9 AM
  ScriptApp.newTrigger('morningStaleCheck')
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .create();

  // Afternoon stale check: 4 PM
  ScriptApp.newTrigger('afternoonStaleCheck')
    .timeBased()
    .atHour(16)
    .everyDays(1)
    .create();

  // Auto-reply processor: every 5 minutes
  ScriptApp.newTrigger('processAutoReplies')
    .timeBased()
    .everyMinutes(5)
    .create();

  // onEdit is installed automatically — no trigger needed

  Logger.log('All triggers created: morningStaleCheck (9AM), afternoonStaleCheck (4PM), processAutoReplies (every 5min)');
}
