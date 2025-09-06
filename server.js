// index.js (Express server for Paynow integration – with Express Checkout)
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Load config from environment
const PAYNOW_ID      = process.env.PAYNOW_INTEGRATION_ID   || '21458';
const PAYNOW_KEY     = process.env.PAYNOW_INTEGRATION_KEY  || 'a35a82b3-aa73-4839-90bd-aa2eb655c9de';
const MERCHANT_EMAIL = process.env.MERCHANT_EMAIL          || 'sukaravtech@gmail.com';
const RETURN_URL     = process.env.PAYNOW_RETURN_URL       || 'https://sukaravtech.art/success';
const RESULT_URL     = process.env.PAYNOW_RESULT_URL       || 'https://sukaravtech.art/paynow-status';

// Utility: Log transaction stages
function logStage(stage, data) {
  console.log(`\n[Paynow] ${stage}:`);
  console.log(data);
}

// Utility: Generate SHA512 hash for Paynow payload
function generatePaynowHash(values) {
  let combined = '';
  for (const [key, value] of Object.entries(values)) {
    if (key.toLowerCase() !== 'hash') {
      combined += value || ''; // concatenate value only
    }
  }
  combined += PAYNOW_KEY; // append integration key
  return crypto.createHash('sha512').update(combined, 'utf8').digest('hex').toUpperCase();
}

// POST endpoint to create a Paynow order
app.post('/create-paynow-order', async (req, res) => {
  const { amount, reference, additionalinfo, returnurl, resulturl, email, method, phone } = req.body;

  if (!amount) {
    return res.status(400).json({ success: false, error: "Amount is required" });
  }

  // Set defaults for optional fields
  const paymentReference   = reference      || `INV-${Date.now()}`;
  const paymentDescription = additionalinfo || 'AI Art Preview for Design Lab';
  const paymentReturnUrl   = returnurl      || RETURN_URL;
  const paymentResultUrl   = resulturl      || RESULT_URL;
  const buyerEmail         = email          || MERCHANT_EMAIL;

  // Construct payload
  const paynowData = {
    id: PAYNOW_ID,
    reference: paymentReference,
    amount: parseFloat(amount).toFixed(2),
    additionalinfo: paymentDescription,
    returnurl: paymentReturnUrl,
    resulturl: paymentResultUrl,
    authemail: buyerEmail,
    status: 'Message'
  };

  // Add Express Checkout details if provided
  if (method && phone) {
    paynowData.method = method; // e.g. 'ecocash'
    paynowData.phone  = phone;  // e.g. '+26377...'
  }

  logStage('Initiate Request Received', req.body);
  logStage('Paynow Payload (before hash)', paynowData);

  try {
    // Generate and attach hash
    paynowData.hash = generatePaynowHash(paynowData);
    logStage('Generated Hash', paynowData.hash);

    // Send request to Paynow
    const paynowRes = await axios.post(
      'https://www.paynow.co.zw/interface/initiatetransaction',
      new URLSearchParams(paynowData),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
    );

    const rawResponse = paynowRes.data;
    logStage('Raw Response from Paynow', rawResponse);

    // Parse response
    const params    = new URLSearchParams(rawResponse);
    const status    = params.get('status')     || params.get('Status');
    const errorMsg  = params.get('error')      || params.get('Error');
    const browserUrl= params.get('browserurl') || params.get('BrowserUrl');
    const pollUrl   = params.get('pollurl')    || params.get('PollUrl');
    const respHash  = params.get('hash')       || params.get('Hash');

    // Optional: verify response hash
    if (respHash) {
      const respValues = {};
      for (const [key, val] of params) {
        if (key.toLowerCase() !== 'hash') {
          respValues[key.toLowerCase()] = val;
        }
      }
      const expectedHash = generatePaynowHash(respValues);
      if (expectedHash !== respHash.toUpperCase()) {
        console.error("[Paynow] ⚠️ Response hash verification failed");
      }
    }

    // Handle response
    if (status && status.toUpperCase() === 'OK') {
      // Express checkout → no redirect needed, still return pollUrl
      if (paynowData.method && paynowData.phone) {
        logStage('Express Checkout Initiated', { pollUrl });
        return res.json({ success: true, pollUrl });
      }
      // Redirect-based checkout
      if (browserUrl) {
        logStage('Payment Initiation Successful', { browserUrl });
        return res.json({ success: true, url: browserUrl, pollUrl });
      }
    }

    // Failure
    console.error("[Paynow] Initiation Error:", errorMsg);
    return res.status(400).json({ success: false, error: errorMsg || 'Paynow initiation failed' });

  } catch (err) {
    console.error("[Paynow] HTTP Request Error:", err.message);
    return res.status(500).json({ success: false, error: 'Server error while initiating payment' });
  }
});

// Health check endpoint
app.get('/healthz', (req, res) => res.send('OK'));

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Paynow server running on port ${PORT}`);
});
