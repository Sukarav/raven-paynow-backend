// server.js – final, minimal version (Node 18+)

require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const crypto  = require('crypto');

const app  = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -----------------------------------------------------------------------------
// ENV CONFIG
// -----------------------------------------------------------------------------
const PAYNOW_ID   = process.env.PAYNOW_INTEGRATION_ID  || '21458';
const PAYNOW_KEY  = process.env.PAYNOW_INTEGRATION_KEY || 'a35a82b3-aa73-4839-90bd-aa2eb655c9de';
const MERCHANT_EM = process.env.MERCHANT_EMAIL         || 'sukaravtech@gmail.com';

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------
function log(stage, data) {
  console.log(`\n[${new Date().toISOString()}] ${stage}:`);
  console.log(data);
}

function sha512Upper(str) {
  return crypto.createHash('sha512').update(str, 'utf8').digest('hex').toUpperCase();
}

/** Build Paynow hash: id+reference+amount+additionalinfo+returnurl+resulturl */
function buildHash(fields) {
  const raw = [
    fields.id,
    fields.reference,
    fields.amount,
    fields.additionalinfo,
    fields.returnurl,
    fields.resulturl
  ].join('');
  return sha512Upper(raw + PAYNOW_KEY);
}

// -----------------------------------------------------------------------------
// ROUTES
// -----------------------------------------------------------------------------
app.post('/create-paynow-order', async (req, res) => {
  try {
    // -----------------------------------------------------------------------
    // 1  Collect / sanitise client data
    // -----------------------------------------------------------------------
    const {
      amount         = '0.69',
      reference      = `IMG-${Date.now()}`,
      additionalinfo = 'AI Glow Preview',
      email          = MERCHANT_EM,
      returnurl      = 'https://sukaravtech.art/payment-success',
      resulturl      = 'https://sukaravtech.art/payment-result'
    } = req.body || {};

    // Paynow needs exactly 2 decimal places
    const fixedAmount = parseFloat(amount).toFixed(2);

    // -----------------------------------------------------------------------
    // 2  Generate hash
    // -----------------------------------------------------------------------
    const hash = buildHash({
      id: PAYNOW_ID,
      reference,
      amount: fixedAmount,
      additionalinfo,
      returnurl,
      resulturl
    });

    // -----------------------------------------------------------------------
    // 3  Prepare payload
    // -----------------------------------------------------------------------
    const payload = new URLSearchParams({
      id:            PAYNOW_ID,
      reference,
      amount:        fixedAmount,
      additionalinfo,
      returnurl,
      resulturl,
      status:        'Message',          // ✅ sent, but NOT hashed
      authemail:     email,
      hash
    });

    log('PayNow Outgoing payload', Object.fromEntries(payload));

    // -----------------------------------------------------------------------
    // 4  POST to Paynow
    // -----------------------------------------------------------------------
    const pnRes = await axios.post(
      'https://www.paynow.co.zw/Interface/InitiateTransaction',
      payload,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const pnData = new URLSearchParams(pnRes.data);
    const status = pnData.get('status');
    const url    = pnData.get('browserurl');

    log('PayNow Raw response', pnRes.data);

    if (status !== 'Ok' || !url) {
      return res.status(502).json({ error: 'Paynow rejected request', details: pnRes.data });
    }

    return res.json({ url });

  } catch (err) {
    console.error('[PayNow] Fatal error:', err?.response?.data || err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// -----------------------------------------------------------------------------
// START
// -----------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🟢 Paynow server listening on ${PORT}`);
});
