// server.js — Paynow Backend (Node 18+)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');

const app = express();

// --- CORS + body parsing ---
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Root + Health checks ---
app.get('/', (_, res) => res.status(200).json({ status: 'ok', service: 'Raven PayNow Backend', version: '1.3.0-test' }));
app.get('/healthz', (_, res) => res.status(200).send('ok'));

// --- ENV ---
const PAYNOW_ID      = process.env.PAYNOW_INTEGRATION_ID  || '21458';
const PAYNOW_KEY     = process.env.PAYNOW_INTEGRATION_KEY || 'a35a82b3-aa73-4839-90bd-aa2eb655c9de';
const MERCHANT_EMAIL = process.env.MERCHANT_EMAIL         || 'client@sukaravtech.art';
const RETURN_URL_DEF = process.env.PAYNOW_RETURN_URL      || 'https://sukaravtech.art/success';
const RESULT_URL_DEF = process.env.PAYNOW_RESULT_URL      || 'https://sukaravtech.art/paynow-status';
const BRAND_DOMAIN   = process.env.BRAND_DOMAIN           || 'sukaravtech.art';

// Supabase config
const SUPABASE_URL         = process.env.SUPABASE_URL         || 'https://ejzbypqqexfrmeulockh.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

// PayNow endpoints
const PN_REDIRECT_URL = 'https://www.paynow.co.zw/interface/initiatetransaction';
const PN_EXPRESS_URL  = 'https://www.paynow.co.zw/interface/remotetransaction';

const WALLET_METHODS = ['ecocash', 'onemoney', 'innbucks', 'omari'];

// TEST MODE — Basic tier temporarily $0.10 for verification
const TIER_MAP = {
  'BASIC':  { tier: 'basic',  amount_usd: 0.10, credits: 1 },
  'PRO':    { tier: 'pro',    amount_usd: 0.69, credits: 3 },
  'STUDIO': { tier: 'studio', amount_usd: 1.00, credits: 5 },
  'HD':     { tier: 'hd_upscale', amount_usd: 1.00, credits: 0 },
  'FLYER':  { tier: 'pro',    amount_usd: 0.69, credits: 3 },
  'STYLE':  { tier: 'pro',    amount_usd: 0.69, credits: 3 },
};

function log(stage, data) {
  console.log(`\n[Paynow] ${stage} @ ${new Date().toISOString()}`);
  if (typeof data === 'string') console.log(data);
  else console.log(JSON.stringify(data, null, 2));
}

function generateHash(valuesObj) {
  let concat = '';
  for (const [k, v] of Object.entries(valuesObj)) {
    if (k.toLowerCase() !== 'hash' && v != null) concat += String(v);
  }
  concat += PAYNOW_KEY;
  return crypto.createHash('sha512').update(concat, 'utf8').digest('hex').toUpperCase();
}

function normalizeMsisdn(msisdn) {
  if (!msisdn) return '';
  let p = String(msisdn).replace(/[^\d+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0'))  p = '263' + p.slice(1);
  if (!p.startsWith('263')) p = '263' + p;
  return p;
}

function resolveTier(reference, amount) {
  if (!reference) return null;
  const prefix = String(reference).split('-')[0].toUpperCase();
  if (TIER_MAP[prefix]) return TIER_MAP[prefix];
  const amt = parseFloat(amount) || 0;
  if (amt <= 0.15) return { tier: 'basic',  amount_usd: amt,  credits: 1 };
  if (amt <= 0.69) return { tier: 'pro',    amount_usd: 0.69, credits: 3 };
  return           { tier: 'studio', amount_usd: 1.00, credits: 5 };
}

async function recordPaymentToSupabase({ reference, amount, tierInfo, userEmail }) {
  if (!SUPABASE_SERVICE_KEY) {
    console.warn('[Supabase] SUPABASE_SERVICE_KEY not set — skipping payment record');
    return;
  }
  try {
    const body = {
      user_id:    null,
      email:      userEmail || null,
      amount_usd: tierInfo.amount_usd,
      tier:       tierInfo.tier,
      credits:    tierInfo.credits,
      reference:  reference || null,
      status:     'confirmed',
    };
    const res = await axios.post(
      `${SUPABASE_URL}/rest/v1/payments`,
      body,
      {
        headers: {
          'apikey':        SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
      }
    );
    log('Supabase payment recorded', { status: res.status, reference, tier: tierInfo.tier });
  } catch (err) {
    console.error('[Supabase] Failed to record payment:', err?.response?.data || err.message);
  }
}

// ---------- Create order ----------
app.post('/create-paynow-order', async (req, res) => {
  try {
    const { amount, reference, additionalinfo, returnurl, resulturl, email, method, phone } = req.body || {};
    if (!amount) return res.status(400).json({ success: false, error: 'Amount is required' });

    const methodLower = method ? String(method).toLowerCase() : '';
    const isExpress = WALLET_METHODS.includes(methodLower);

    const payload = {
      id:             PAYNOW_ID,
      reference:      reference || `INV-${Date.now()}`,
      amount:         Number(amount).toFixed(2),
      additionalinfo: additionalinfo || 'Sukarav – AI Art Preview',
      returnurl:      returnurl || RETURN_URL_DEF,
      resulturl:      resulturl || RESULT_URL_DEF,
      status:         'Message',
      authemail:      email || MERCHANT_EMAIL,
    };

    let paynowUrl = PN_REDIRECT_URL;

    if (isExpress) {
      const normPhone = normalizeMsisdn(phone);
      if (!normPhone || !/^263\d{9}$/.test(normPhone)) {
        return res.status(400).json({ success: false, error: 'Valid wallet number required (e.g. 26377xxxxxxx — 12 digits total)' });
      }
      payload.authemail = `${normPhone}@${BRAND_DOMAIN}`;
      payload.method    = methodLower;
      payload.phone     = normPhone;
      paynowUrl = PN_EXPRESS_URL;
    }

    payload.hash = generateHash(payload);
    log(`Outgoing payload [${isExpress ? 'EXPRESS' : 'REDIRECT'}] → ${paynowUrl}`, payload);

    const pnRes = await axios.post(paynowUrl, new URLSearchParams(payload), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const raw = pnRes.data;
    log('Raw PayNow response', raw);

    const p = new URLSearchParams(raw);
    const status     = p.get('status')     || p.get('Status')     || '';
    const errorMsg   = p.get('error')      || p.get('Error')      || '';
    const browserurl = p.get('browserurl') || p.get('BrowserUrl') || null;
    const pollurl    = p.get('pollurl')    || p.get('PollUrl')    || null;

    if (status.toUpperCase() !== 'OK') {
      log('PayNow error response', { status, errorMsg, raw });
      return res.status(400).json({ success: false, error: errorMsg || `PayNow returned status: ${status}` });
    }

    return res.json({ success: true, express: isExpress, url: browserurl, pollUrl: pollurl });

  } catch (err) {
    const detail = err?.response?.data || err.message;
    console.error('[Paynow] HTTP Error:', detail);
    return res.status(500).json({ success: false, error: 'Server error contacting PayNow' });
  }
});

// ---------- Poll endpoint ----------
app.get('/poll', async (req, res) => {
  const { pollUrl, reference, amount, email } = req.query;
  if (!pollUrl) return res.status(400).json({ success: false, error: 'pollUrl is required' });

  try {
    const pnRes = await axios.get(pollUrl);
    const raw = pnRes.data;
    log('Poll raw', raw);

    const p      = new URLSearchParams(raw);
    const status = (p.get('status') || p.get('Status') || '').toLowerCase();
    const ref    = reference || p.get('reference') || p.get('Reference') || '';
    const amt    = amount    || p.get('amount')    || p.get('Amount')    || '0';

    if (status === 'paid') {
      const tierInfo = resolveTier(ref, amt);
      if (tierInfo) {
        await recordPaymentToSupabase({ reference: ref, amount: amt, tierInfo, userEmail: email || null });
      }
    }

    return res.json({ success: true, status, reference: ref });
  } catch (e) {
    console.error('[Paynow] Poll error:', e?.response?.data || e.message);
    return res.status(500).json({ success: false, error: 'Poll failed' });
  }
});

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Paynow backend running on 0.0.0.0:${PORT}`));
