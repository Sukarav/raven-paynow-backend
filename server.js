// server.js  —  Express backend for PayNow
require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 10_000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ────────────────────────────────────────────
   Environment / defaults
   ────────────────────────────────────────── */
const PAYNOW_ID    = process.env.PAYNOW_INTEGRATION_ID  || '21458';
const PAYNOW_KEY   = process.env.PAYNOW_INTEGRATION_KEY || 'a35a82b3-aa73-4839-90bd-aa2eb655c9de';
const MERCHANT_MAIL= process.env.MERCHANT_EMAIL         || 'sukaravtech@gmail.com';

const DEFAULT_RETURN = process.env.PAYNOW_RETURN_URL || 'https://sukaravtech.art/payment-success';
const DEFAULT_RESULT = process.env.PAYNOW_RESULT_URL || 'https://sukaravtech.art/payment-result';

/* ────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────── */
// PayNow treats “ ” → "+"  (space becomes plus) and
// expects exactly that representation in the hash.
const encodePZ = (v) => encodeURIComponent(v).replace(/%20/g, '+');

function createHash(values) {
  const concatenated =
    encodePZ(values.id)            +
    encodePZ(values.reference)     +
    encodePZ(values.amount)        +
    encodePZ(values.additionalinfo)+
    encodePZ(values.returnurl)     +
    encodePZ(values.resulturl)     +
    encodePZ(values.status)        +
    PAYNOW_KEY;                     // secret last

  return crypto
    .createHash('sha512')
    .update(concatenated, 'utf8')
    .digest('hex')
    .toUpperCase();
}

/* ────────────────────────────────────────────
   Logging (shows in Render “Logs” tab)
   ────────────────────────────────────────── */
app.use((req, _res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.url} | body →`,
    req.headers['content-type']?.startsWith('application/json')
      ? req.body
      : '[non-json]'
  );
  next();
});

/* ────────────────────────────────────────────
   Main endpoint
   ────────────────────────────────────────── */
app.post('/create-paynow-order', async (req, res) => {
  try {
    const {
      amount,
      reference = `IMG-${Date.now()}`,
      additionalinfo = 'AI Glow Preview',
      returnurl = DEFAULT_RETURN,
      resulturl = DEFAULT_RESULT,
      email = MERCHANT_MAIL
    } = req.body;

    if (!amount) return res.status(400).json({ error: 'Amount is required' });

    // build **raw** payload first
    const payload = {
      id: PAYNOW_ID,
      reference,
      amount,
      additionalinfo,
      returnurl,
      resulturl,
      status: 'Message',
      authemail: email          // NOT in the hash
    };

    // add hash
    payload.hash = createHash(payload);

    console.log('[PayNow] Outgoing payload:', payload);

    // convert to x-www-form-urlencoded
    const body = new URLSearchParams(payload).toString();

    const { data: rawResp } = await axios.post(
      'https://www.paynow.co.zw/Interface/InitiateTransaction',
      body,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    console.log('[PayNow] Raw response:', rawResp);

    const resp = new URLSearchParams(rawResp);
    if (resp.get('status') !== 'Ok')
      return res.status(500).json({
        error: 'PayNow rejected the request',
        details: rawResp
      });

    return res.json({ success: true, url: resp.get('browserurl') });
  } catch (err) {
    console.error('[PayNow] Fatal error:', err?.response?.data || err.message);
    res.status(500).json({
      error: 'Internal server error',
      details: err?.message || 'unknown'
    });
  }
});

/* ──────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`🟢 PayNow server listening on ${PORT}`);
});
