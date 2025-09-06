// server.js – Express server for Paynow integration with Express Checkout
require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const crypto  = require('crypto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ───── Config ─────
const PAYNOW_ID      = process.env.PAYNOW_INTEGRATION_ID   || '21458';
const PAYNOW_KEY     = process.env.PAYNOW_INTEGRATION_KEY  || 'a35a82b3-aa73-4839-90bd-aa2eb655c9de';
const MERCHANT_EMAIL = process.env.MERCHANT_EMAIL          || 'sukaravtech@gmail.com';
const RETURN_URL     = process.env.PAYNOW_RETURN_URL       || 'https://sukaravtech.art/success';
const RESULT_URL     = process.env.PAYNOW_RESULT_URL       || 'https://sukaravtech.art/paynow-status';

// ───── Helpers ─────
function logStage(stage, data) {
  console.log(`\n[Paynow] ${stage}:`);
  console.log(data);
}

function generatePaynowHash(values) {
  let combined = '';
  for (const [key, value] of Object.entries(values)) {
    if (key.toLowerCase() !== 'hash') combined += value || '';
  }
  combined += PAYNOW_KEY;
  return crypto.createHash('sha512').update(combined, 'utf8').digest('hex').toUpperCase();
}

// ───── Endpoint ─────
app.post('/create-paynow-order', async (req, res) => {
  const { amount, reference, additionalinfo, returnurl, resulturl, email, method, phone } = req.body;

  if (!amount) {
    return res.status(400).json({ success: false, error: 'Amount is required' });
  }

  // Basic defaults
  const paymentReference   = reference      || `INV-${Date.now()}`;
  const paymentDescription = additionalinfo || 'AI Art Preview for Design Lab';
  const paymentReturnUrl   = returnurl      || RETURN_URL;
  const paymentResultUrl   = resulturl      || RESULT_URL;

  // ── Express checkout handling ──
  let buyerEmail = email || MERCHANT_EMAIL;
  let normalizedPhone = phone;

  if (method && ['ecocash','onemoney','innbucks','omari'].includes(method.toLowerCase())) {
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Phone number required for express checkout' });
    }

    // normalize to 26377xxxxxxx
    normalizedPhone = phone.replace(/^\+/, '');
    if (normalizedPhone.startsWith('0')) {
      normalizedPhone = '263' + normalizedPhone.slice(1);
    }
    if (!normalizedPhone.startsWith('263')) {
      return res.status(400).json({ success: false, error: 'Invalid phone number format' });
    }

    // build authemail as per Paynow docs
    buyerEmail = `${normalizedPhone}@sukaravtech.art`;
  }

  // ── Construct payload ──
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
    paynowData.method = method;
    paynowData.phone  = normalizedPhone;
  }

  logStage('Initiate Request Received', req.body);
  logStage('Paynow Payload (before hash)', paynowData);

  try {
    paynowData.hash = generatePaynowHash(paynowData);
    logStage('Generated Hash', paynowData.hash);

    const paynowRes = await axios.post(
      'https://www.paynow.co.zw/interface/initiatetransaction',
      new URLSearchParams(paynowData),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const rawResponse = paynowRes.data;
    logStage('Raw Response from Paynow', rawResponse);

    const params     = new URLSearchParams(rawResponse);
    const status     = params.get('status')     || params.get('Status');
    const errorMsg   = params.get('error')      || params.get('Error');
    const browserUrl = params.get('browserurl') || params.get('BrowserUrl');
    const pollUrl    = params.get('pollurl')    || params.get('PollUrl');
    const respHash   = params.get('hash')       || params.get('Hash');

    // Optional: Verify response hash
    if (respHash) {
      const respValues = {};
      for (const [k, v] of params) {
        if (k.toLowerCase() !== 'hash') respValues[k.toLowerCase()] = v;
      }
      const expected = generatePaynowHash(respValues);
      if (expected !== respHash.toUpperCase()) {
        console.error('[Paynow] Warning: Response hash mismatch');
      }
    }

    if (status && status.toUpperCase() === 'OK') {
      return res.json({
        success: true,
        url: browserUrl,  // may be empty for express
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

// ───── Start ─────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PayNow backend running on port ${PORT}`));
