// server.js  –  Express server for PayNow

require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const crypto  = require('crypto');

const app = express();

/* ──────────────────────────────────────────────────────────
   ░ Middleware order ░
   ────────────────────────────────────────────────────────── */
app.use(cors());                               // allow browser calls
app.use(express.json());                       // JSON body → req.body
app.use(express.urlencoded({ extended: true })); // (optional) form posts

// tiny logger – every request shows up in Render “Logs”
app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.url}`,
    'body:',
    req.headers['content-type']?.startsWith('application/json')
      ? JSON.stringify(req.body ?? {})
      : '[non-JSON]'
  );
  next();
});

/* ──────────────────────────────────────────────────────────
   ░ Config from env (with safe fall-backs) ░
   ────────────────────────────────────────────────────────── */
const PAYNOW_ID        = process.env.PAYNOW_INTEGRATION_ID  || '21458';
const PAYNOW_KEY       = process.env.PAYNOW_INTEGRATION_KEY || 'a35a82b3-aa73-4839-90bd-aa2eb655c9de';
const MERCHANT_EMAIL   = process.env.MERCHANT_EMAIL         || 'sukaravtech@gmail.com';
const DEFAULT_RETURN   = process.env.PAYNOW_RETURN_URL      || 'https://sukaravtech.art/success';
const DEFAULT_RESULT   = process.env.PAYNOW_RESULT_URL      || 'https://sukaravtech.art/paynow-status';

/* ──────────────────────────────────────────────────────────
   ░ Utility helpers ░
   ────────────────────────────────────────────────────────── */
function logStage(stage, data) {
  console.log(`\n[PayNow] ${stage}:`);
  console.log(data);
}

function generateHash(values /* array */) {
  const raw = values.join('') + PAYNOW_KEY;
  const hash = crypto.createHash('sha512').update(raw, 'utf8').digest('hex');
  return hash.toUpperCase();
}

/* ──────────────────────────────────────────────────────────
   ░ Main endpoint ░
   ────────────────────────────────────────────────────────── */
app.post('/create-paynow-order', async (req, res) => {
  try {
    const {
      amount,
      reference = 'RAVEN_ORDER',
      additionalinfo = 'Art Payment',
      description,
      returnurl  = DEFAULT_RETURN,
      resulturl  = DEFAULT_RESULT,
      email      = MERCHANT_EMAIL
    } = req.body || {};

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    const info  = additionalinfo || description || 'Art Payment';
    const status = 'Message';

    // Build hash in correct order (exclude authemail + hash)
    const hash = generateHash([
      PAYNOW_ID,
      reference,
      amount,
      info,
      returnurl,
      resulturl,
      status
    ]);

    // Build payload
    const params = new URLSearchParams({
      id: PAYNOW_ID,
      reference,
      amount,
      additionalinfo: info,
      returnurl,
      resulturl,
      status,
      authemail: email,
      hash
    });

    logStage('Outgoing payload', params.toString());

    // Call PayNow
    const pnRes = await axios.post(
      'https://www.paynow.co.zw/Interface/InitiateTransaction',
      params,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    logStage('Raw response', pnRes.data);

    const parsed = new URLSearchParams(pnRes.data);
    const browserUrl = parsed.get('browserurl');
    const pnStatus   = parsed.get('status');

    if (pnStatus === 'Ok' && browserUrl) {
      return res.json({ url: browserUrl });
    }

    // If status ≠ Ok, bubble the error
    return res.status(500).json({
      error: 'PayNow returned an error',
      details: pnRes.data
    });

  } catch (err) {
    console.error('[PayNow] Exception:', err?.response?.data || err.message);
    return res.status(500).json({
      error: 'Internal server error',
      details: err?.response?.data || err.message
    });
  }
});

/* ──────────────────────────────────────────────────────────
   ░ Optional: Webhook endpoint ░
   PayNow will POST here with transaction status once complete
   ────────────────────────────────────────────────────────── */
app.post('/api/paynow/webhook', (req, res) => {
  logStage('Webhook hit', req.body);
  // ⚠️ Verify hash & update DB / send email, etc.
  res.sendStatus(200);
});

/* ──────────────────────────────────────────────────────────
   ░ Start server ░
   ────────────────────────────────────────────────────────── */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ Raven PayNow server running on port ${PORT}`);
  console.log(`Webhook URL (for PayNow config): ${process.env.RENDER_EXTERNAL_URL || 'https://YOUR-SERVICE.onrender.com'}/api/paynow/webhook`);
});
