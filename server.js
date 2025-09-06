// server.js – Paynow backend with Express Checkout support
require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const crypto  = require('crypto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ─────────── Config ─────────── */
const PAYNOW_ID      = process.env.PAYNOW_INTEGRATION_ID   || '21458';
const PAYNOW_KEY     = process.env.PAYNOW_INTEGRATION_KEY  || 'a35a82b3-aa73-4839-90bd-aa2eb655c9de';
const MERCHANT_EMAIL = process.env.MERCHANT_EMAIL          || 'sukaravtech@gmail.com';
const RETURN_URL     = process.env.PAYNOW_RETURN_URL       || 'https://sukaravtech.art/success';
const RESULT_URL     = process.env.PAYNOW_RESULT_URL       || 'https://sukaravtech.art/paynow-status';

/* ─────────── Helpers ─────────── */
function log(stage, data) {
  console.log(`\n[Paynow] ${stage}:`);
  console.log(data);
}

function generateHash(values) {
  let combined = '';
  for (const [k, v] of Object.entries(values)) {
    if (k.toLowerCase() !== 'hash') combined += v || '';
  }
  combined += PAYNOW_KEY;
  return crypto.createHash('sha512').update(combined, 'utf8').digest('hex').toUpperCase();
}

/* ─────────── Endpoint ─────────── */
app.post('/create-paynow-order', async (req, res) => {
  const { amount, reference, additionalinfo, returnurl, resulturl, email, method, phone } = req.body;

  if (!amount) {
    return res.status(400).json({ success: false, error: 'Amount is required' });
  }

  // Defaults
  const paymentReference   = reference      || `INV-${Date.now()}`;
  const paymentDescription = additionalinfo || 'AI Art Preview for Design Lab';
  const paymentReturnUrl   = returnurl      || RETURN_URL;
  const paymentResultUrl   = resulturl      || RESULT_URL;
  let buyerEmail           = email || MERCHANT_EMAIL;

  // ── Express checkout handling ──
  let normalizedPhone = phone;
  if (method && ['ecocash','onemoney','innbucks','omari'].includes(method.toLowerCase())) {
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number required for express checkout' });
    }

    normalizedPhone = phone.replace(/^\+/, ''); // strip leading +
    if (normalizedPhone.startsWith('0')) {
      normalizedPhone = '263' + normalizedPhone.slice(1);
    }
    if (!normalizedPhone.startsWith('263')) {
      return res.status(400).json({ success: false, error: 'Invalid phone format. Must start with 263' });
    }

    // build authemail as per Paynow docs
    buyerEmail = `${normalizedPhone}@sukaravtech.art`;
  }

  // Payload
  const paynowData = {
    id            : PAYNOW_ID,
    reference     : paymentReference,
    amount        : parseFloat(amount).toFixed(2),
    additionalinfo: paymentDescription,
    returnurl     : paymentReturnUrl,
    resulturl     : paymentResultUrl,
    authemail     : buyerEmail,
    status        : 'Message'
  };

  if (method && ['ecocash','onemoney','innbucks','omari'].includes(method.toLowerCase())) {
    paynowData.method = method.toLowerCase();
    paynowData.phone  = normalizedPhone;
  }

  log('Initiate Request Received', req.body);
  log('Paynow Payload (before hash)', paynowData);

  try {
    // Generate hash
    paynowData.hash = generateHash(paynowData);
    log('Generated Hash', paynowData.hash);

    // Call Paynow
    const pnRes = await axios.post(
      'https://www.paynow.co.zw/interface/initiatetransaction',
      new URLSearchParams(paynowData),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const rawResponse = pnRes.data;
    log('Raw Response', rawResponse);

    const params = new URLSearchParams(rawResponse);
    const status    = params.get('status')    || params.get('Status');
    const errorMsg  = params.get('error')     || params.get('Error');
    const browserUrl= params.get('browserurl')|| params.get('BrowserUrl');
    const pollUrl   = params.get('pollurl')   || params.get('PollUrl');
    const respHash  = params.get('hash')      || params.get('Hash');

    // Optional: Verify Paynow response hash
    if (respHash) {
      const respValues = {};
      for (const [k, v] of params) {
        if (k.toLowerCase() !== 'hash') respValues[k.toLowerCase()] = v;
      }
      const expected = generateHash(respValues);
      if (expected !== respHash.toUpperCase()) {
        console.error('[Paynow] ⚠️ Response hash mismatch!');
      }
    }

    if (status && status.toUpperCase() === 'OK') {
      return res.json({
        success: true,
        url: browserUrl, // may be blank for express
        pollUrl
      });
    } else {
      return res.status(400).json({ success: false, error: errorMsg || 'Paynow initiation failed' });
    }
  } catch (err) {
    console.error('[Paynow] HTTP Error:', err?.response?.data || err.message);
    return res.status(500).json({ success: false, error: 'Server error while initiating payment' });
  }
});

/* ─────────── Start ─────────── */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Paynow backend running on port ${PORT}`));
