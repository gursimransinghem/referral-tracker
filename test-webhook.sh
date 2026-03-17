#!/bin/bash
# =============================================================================
# Test the Referral Tracker webhook without an iPhone
# Replace the URL below with your deployed Google Apps Script web app URL.
# =============================================================================

WEBHOOK_URL="YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL"

echo "============================================"
echo "  Test 1: Real-looking referral message"
echo "============================================"
echo ""

curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hey I have a referral for you. Patient Maria Garcia, DOB 3/15/1980, phone 786-555-1234, email maria.garcia@email.com. She was in a car accident last week, has neck and lower back pain. She lives in 33155. Diagnosis cervical strain and lumbar radiculopathy. Please get her in ASAP.",
    "sender": "+15559876543",
    "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
  }' | python3 -m json.tool

echo ""
echo "============================================"
echo "  Test 2: Vague/minimal referral"
echo "============================================"
echo ""

curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Got a referral - John Doe 555-0199 back pain from a fall at work",
    "sender": "+15551112222",
    "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
  }' | python3 -m json.tool

echo ""
echo "============================================"
echo "  Test 3: NOT a referral (should be rejected)"
echo "============================================"
echo ""

curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hey are we still on for golf Saturday? Bring the referral forms btw",
    "sender": "+15553334444",
    "timestamp": "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"
  }' | python3 -m json.tool

echo ""
echo "============================================"
echo "  Test 4: Webhook health check (GET)"
echo "============================================"
echo ""

curl -s "$WEBHOOK_URL" | python3 -m json.tool

echo ""
echo "Done. Check your Google Sheet for new rows."
echo ""
