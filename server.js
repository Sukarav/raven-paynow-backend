// index.js (Express server for Paynow integration)
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Load config from environment
const PAYNOW_ID     = process.env.PAYNOW_INTEGRATION_ID   || '21458';
const PAYNOW_KEY    = process.env.PAYNOW_INTEGRATION_KEY  || 'a35a82b3-aa73-4839-90bd-aa2eb655c9de';
const MERCHANT_EMAIL= process.env.MERCHANT_EMAIL          || 'sukaravtech@gmail.com';
const RETURN_URL    = process.env.PAYNOW_RETURN_URL       || 'https://sukaravtech.art/success';
const RESULT_URL    = process.env.PAYNOW_RESULT_URL       || 'https://sukaravtech.art/paynow-status';

// Utility: Log transaction stages (for debugging)
function logStage(stage, data) {
  console.log(`\n[Paynow] ${stage}:`);
  console.log(data);
}

// Utility: Generate SHA512 hash for Paynow payload
function generatePaynowHash(values) {
  let combined = '';
  for (const [key, value] of Object.entries(values)) {
    if (key.toLowerCase() !== 'hash') {
      combined += value || '';  // concatenate value (omit key names and empty values)
    }
  }
  combined += PAYNOW_KEY;  // append the integration key
  return crypto.createHash('sha512').update(combined, 'utf8').digest('hex').toUpperCase();
}

// POST endpoint to create a Paynow order
app.post('/create-paynow-order', async (req, res) => {
  const { amount, reference, additionalinfo, returnurl, resulturl, email } = req.body;
  if (!amount) {
    return res.status(400).json({ success: false, error: "Amount is required" });
  }

  // Set defaults for optional fields
  const paymentReference   = reference || `INV-${Date.now()}`;             // generate unique reference if not provided
  const paymentDescription = additionalinfo || 'AI Art Preview for Design Lab';
  const paymentReturnUrl   = returnurl || RETURN_URL;
  const paymentResultUrl   = resulturl || RESULT_URL;
  const buyerEmail         = email || MERCHANT_EMAIL;

  // Construct payload for Paynow
  const paynowData = {
    id: PAYNOW_ID,
    reference: paymentReference,
    amount: parseFloat(amount).toFixed(2),  // format amount to two decimals
    additionalinfo: paymentDescription,
    returnurl: paymentReturnUrl,
    resulturl: paymentResultUrl,
    authemail: buyerEmail,
    status: 'Message'
  };

  logStage('Initiate Request Received', req.body);
  logStage('Paynow Payload (before hash)', paynowData);

  try {
    // Generate security hash and attach to payload
    paynowData.hash = generatePaynowHash(paynowData);
    logStage('Generated Hash', paynowData.hash);

    // Send the initiate transaction request to Paynow (form-urlencoded)
    const paynowRes = await axios.post(
      'https://www.paynow.co.zw/interface/initiatetransaction',
      new URLSearchParams(paynowData),  // form data
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }}
    );
    const rawResponse = paynowRes.data;  // Paynow returns a URL-encoded response string
    logStage('Raw Response from Paynow', rawResponse);

    // Parse the response string into key-value pairs
    const params = new URLSearchParams(rawResponse);
    const status    = params.get('status')    || params.get('Status');
    const errorMsg  = params.get('error')     || params.get('Error');
    const browserUrl= params.get('browserurl')|| params.get('BrowserUrl');
    const pollUrl   = params.get('pollurl')   || params.get('PollUrl');
    const respHash  = params.get('hash')      || params.get('Hash');

    // Verify Paynow's response hash for security (ensure the response is untampered)
    if (respHash) {
      const respValues = {};
      for (const [key, val] of params) {
        if (key.toLowerCase() !== 'hash') {
          respValues[key.toLowerCase()] = val;  // use decoded values
        }
      }
      const expectedHash = generatePaynowHash(respValues);
      if (expectedHash !== respHash.toUpperCase()) {
        console.error("[Paynow] Warning: Hash verification failed for Paynow response.");
        // (Optional: you could return an error here instead of proceeding)
      }
    }

    // Handle Paynow response
    if (status && status.toUpperCase() === 'OK' && browserUrl) {
      // Success: Paynow created the transaction
      logStage('Payment Initiation Successful', `BrowserUrl: ${browserUrl}`);
      return res.json({ success: true, url: browserUrl, pollUrl: pollUrl });
    } else {
      // Failure: Paynow returned an error
      console.error("[Paynow] Initiation Error:", errorMsg);
      return res.status(400).json({ success: false, error: errorMsg || 'Paynow initiation failed' });
    }
  } catch (err) {
    console.error("[Paynow] HTTP Request Error:", err.message);
    return res.status(500).json({ success: false, error: 'Server error while initiating payment' });
  }
});

// Start the server on the configured port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
