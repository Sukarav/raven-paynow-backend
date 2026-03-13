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
app.get('/', (_, res) => res.status(200).json({ status: 'ok', service: 'Raven PayNow Backend', version: '1.1.0' }));
app.get('/healthz', (_, res) => res.status(200).send('ok'));

// --- ENV ---
const PAYNOW_ID      = process.env.PAYNOW_INTEGRATION_ID  || '21458';
const PAYNOW_KEY     = process.env.PAYNOW_INTEGRATION_KEY || 'a35a82b3-aa73-4839-90bd-aa2eb655c9de';
const MERCHANT_EMAIL = process.env.MERCHANT_EMAIL         || 'client@sukaravtech.art';
const RETURN_URL_DEF = process.env.PAYNOW_RETURN_URL      || 'https://sukaravtech.art/success';
const RESULT_URL_DEF = process.env.PAYNOW_RESULT_URL      || 'https://sukaravtech.art/paynow-status';
const BRAND_DOMAIN   = process.env.BRAND_DOMAIN           || 'sukaravtech.art';

// PayNow endpoints
const PN_REDIRECT_URL = 'https://www.paynow.co.zw/interface/initiatetransaction';
const PN_EXPRESS_URL  = 'https://www.paynow.co.zw/interface/remotetransaction';

// Wallet methods that use express checkout (USSD push)
const WALLET_METHODS = ['ecocash', 'onemoney', 'innbucks', 'omari'];

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

// ---------- Create order ----------
app.post('/create-paynow-order', async (req, res) => {
  try {
    const {
      amount,
      reference,
      additionalinfo,
      returnurl,
      resulturl,
      email,
      method,
      phone
    } = req.body || {};

    if (!amount) return res.status(400).json({ success: false, error: 'Amount is required' });

    const methodLower = method ? String(method).toLowerCase() : '';
    const isExpress = WALLET_METHODS.includes(methodLower);

    // --- Build base payload ---
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
      // Express checkout: validate and normalize phone
      const normPhone = normalizeMsisdn(phone);
      if (!normPhone || !/^263\d{9}$/.test(normPhone)) {
        return res.status(400).json({
          success: false,
          error: 'Valid wallet number required (e.g. 26377xxxxxxx — 12 digits total)'
        });
      }
      // Per PayNow docs: authemail for express = mobilenumber@yoursite.com
      payload.authemail = `${normPhone}@${BRAND_DOMAIN}`;
      payload.method    = methodLower;
      payload.phone     = normPhone;
      // Express uses the remotetransaction endpoint
      paynowUrl = PN_EXPRESS_URL;
    }

    payload.hash = generateHash(payload);

    log(`Outgoing payload [${isExpress ? 'EXPRESS' : 'REDIRECT'}] → ${paynowUrl}`, payload);

    const pnRes = await axios.post(
      paynowUrl,
      new URLSearchParams(payload),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

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

    return res.json({
      success:  true,
      express:  isExpress,
      url:      browserurl,
      pollUrl:  pollurl,
    });

  } catch (err) {
    const detail = err?.response?.data || err.message;
    console.error('[Paynow] HTTP Error:', detail);
    return res.status(500).json({ success: false, error: 'Server error contacting PayNow' });
  }
});

// ---------- Poll endpoint ----------
app.get('/poll', async (req, res) => {
  const { pollUrl } = req.query;
  if (!pollUrl) return res.status(400).json({ success: false, error: 'pollUrl is required' });

  try {
    const pnRes = await axios.get(pollUrl);
    const raw = pnRes.data;
    log('Poll raw', raw);
    const p      = new URLSearchParams(raw);
    const status = p.get('status')    || p.get('Status')    || '';
    const ref    = p.get('reference') || p.get('Reference') || '';
    return res.json({ success: true, status, reference: ref });
  } catch (e) {
    console.error('[Paynow] Poll error:', e?.response?.data || e.message);
    return res.status(500).json({ success: false, error: 'Poll failed' });
  }
});

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Paynow backend running on 0.0.0.0:${PORT}`));
