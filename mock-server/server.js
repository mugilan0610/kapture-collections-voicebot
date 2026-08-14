/**
 * Mugilan Collections Voicebot — Mock Webhook Server
 * ----------------------------------------------------
 * WHAT THIS FILE DOES:
 * Vapi (the voice platform) calls this server whenever the AI decides to
 * use a "tool" (e.g. verify_customer). This server pretends to be
 * Kapture Finance's real backend and sends back a realistic fake answer.
 *
 * WHY IT'S BUILT THIS WAY:
 * - Only ONE route (/webhook) handles everything, because that's the
 *   single URL you paste into Vapi for every tool.
 * - Security basics are included even though this is a mock:
 *     1. A shared-secret header check (WEBHOOK_SECRET) so random people
 *        on the internet can't spam your endpoint once it's public.
 *     2. PII (verification codes, full names) is masked before logging.
 *     3. Basic security headers via helmet.
 *     4. Input validation on every tool before using the data.
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');

const app = express();
app.use(express.json());
app.use(helmet());

// ---- Simple shared-secret check ---------------------------------------
// Set WEBHOOK_SECRET in your .env file, then add the same value as a
// custom header in Vapi's tool config (e.g. "x-webhook-secret").
// If you don't set WEBHOOK_SECRET, this check is skipped (fine for local
// testing, NOT recommended once your ngrok/Render URL is public).
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

function isAuthorized(req) {
  if (!WEBHOOK_SECRET) return true; // no secret configured -> skip check (dev mode)
  return req.headers['x-webhook-secret'] === WEBHOOK_SECRET;
}

// ---- Helper: mask PII before logging -----------------------------------
function maskCode(code) {
  if (!code || typeof code !== 'string') return '****';
  return code.length <= 2 ? '**' : code.slice(0, 1) + '*'.repeat(code.length - 1);
}

// ---- Mock "database" ----------------------------------------------------
// In a real system this would be a secure lookup against Kapture's core
// banking / loan management system, not a hardcoded object.
const MOCK_ACCOUNTS = {
  'ACC-88392': {
    customerName: 'Rahul Sharma',
    validCodes: ['1234', '1995'], // last-4 PAN digits OR birth year, either works for demo
    amount: 8499,
    dpd: 12,
    loanType: 'Personal Loan',
  },
};

// ---- Main webhook endpoint ------------------------------------------------
app.post('/webhook', (req, res) => {
  if (!isAuthorized(req)) {
    console.warn('[Blocked] Request missing/invalid webhook secret.');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { message } = req.body || {};

  if (!message || message.type !== 'tool-calls' || !Array.isArray(message.toolCalls) || message.toolCalls.length === 0) {
    // Vapi also sends other event types (call-start, call-end, etc.) — just acknowledge those.
    return res.status(200).json({ status: 'acknowledged' });
  }

  const toolCall = message.toolCalls[0];
  const { name, arguments: args = {} } = toolCall.function || {};
  const callId = toolCall.id;

  let result = {};

  switch (name) {
    case 'verify_customer': {
      const { account_id, verification_code } = args;
      console.log(`[Tool Call] verify_customer | account=${account_id} | code=${maskCode(verification_code)}`);

      const account = MOCK_ACCOUNTS[account_id];
      if (!account) {
        result = { verified: false, message: 'Account not found.' };
        break;
      }
      const isValid = account.validCodes.includes(String(verification_code || '').trim());
      result = isValid
        ? { verified: true, message: 'Identity verified successfully.' }
        : { verified: false, message: 'Verification failed. Incorrect code.' };
      break;
    }

    case 'log_promise_to_pay': {
      const { account_id, ptp_date, amount } = args;
      console.log(`[Tool Call] log_promise_to_pay | account=${account_id} | date=${ptp_date} | amount=${amount}`);

      if (!account_id || !ptp_date || typeof amount !== 'number') {
        result = { success: false, message: 'Missing or invalid fields.' };
        break;
      }
      result = {
        success: true,
        ptp_id: `PTP-${Math.floor(1000 + Math.random() * 9000)}`,
        confirmed_date: ptp_date,
        amount,
      };
      break;
    }

    case 'send_payment_link': {
      const { account_id, channel } = args;
      console.log(`[Tool Call] send_payment_link | account=${account_id} | channel=${channel}`);

      const allowedChannels = ['SMS', 'WhatsApp', 'BOTH'];
      if (!allowedChannels.includes(channel)) {
        result = { success: false, message: 'Invalid channel.' };
        break;
      }
      result = {
        success: true,
        message: `Payment link sent successfully via ${channel} to registered mobile number.`,
      };
      break;
    }

    case 'escalate_to_agent': {
      const { account_id, reason } = args;
      console.log(`[Tool Call] escalate_to_agent | account=${account_id} | reason=${reason}`);

      result = {
        success: true,
        ticket_id: `ESC-${Math.floor(1000 + Math.random() * 9000)}`,
        message: 'Escalated to human agent queue.',
      };
      break;
    }

    case 'mark_disposition': {
      const { account_id, status, notes } = args;
      console.log(`[Tool Call] mark_disposition | account=${account_id} | status=${status}`);

      const validStatuses = [
        'PTP_AGREED', 'ALREADY_PAID', 'DISPUTED', 'HARDSHIP_ESCALATED',
        'WRONG_PERSON', 'DO_NOT_CALL', 'NO_RESPONSE',
      ];
      if (!validStatuses.includes(status)) {
        result = { success: false, message: 'Invalid disposition status.' };
        break;
      }
      result = {
        success: true,
        disposition_logged: status,
        notes: notes || '',
        timestamp: new Date().toISOString(),
      };
      break;
    }

    default:
      console.warn(`[Tool Call] Unknown function requested: ${name}`);
      result = { success: false, message: 'Unknown function call' };
  }

  // This exact response shape is what Vapi expects back for a tool call.
  return res.status(200).json({
    results: [
      {
        toolCallId: callId,
        result: JSON.stringify(result),
      },
    ],
  });
});

// Simple health check — useful to confirm ngrok/Render is actually
// reaching this server before you wire up Vapi.
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', agent: 'Mugilan', service: 'Kapture Mock Collections Webhook' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Kapture Mock Collections Webhook Server (Mugilan) running on port ${PORT}`);
  if (!WEBHOOK_SECRET) {
    console.log('NOTE: WEBHOOK_SECRET is not set — running in open dev mode. Set it in .env before going public.');
  }
});
