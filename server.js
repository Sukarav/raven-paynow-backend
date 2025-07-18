const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Generate correct PayNow SHA512 hash
function generateHash(id, reference, amount, info, returnUrl, resultUrl, key) {
  const rawString = `${id}${reference}${amount}${info}${returnUrl}${resultUrl}${key}`;
  console.log("🧪 Hashing string:", rawString); // For debug
  return crypto.createHash('sha512').update(rawString).digest('hex');
}

app.post('/create-paynow-order', async (req, res) => {
  const {
    amount,
    reference,
    additionalinfo,
    returnurl,
    resulturl,
    description,
    email
  } = req.body;

  const id = process.env.INTEGRATION_ID;
  const key = process.env.INTEGRATION_KEY;

  const finalReference = reference || 'RAVEN_ORDER';
  const finalInfo = additionalinfo || description || 'Art Payment';
  const finalReturn = returnurl || 'https://example.com/return';
  const finalResult = resulturl || 'https://example.com/result';
  const finalEmail = email || process.env.MERCHANT_EMAIL || 'buyer@example.com';

  // ✅ Generate correct hash in the expected order
  const hash = generateHash(
    id,
    finalReference,
    amount,
    finalInfo,
    finalReturn,
    finalResult,
    key
  );

  const params = new URLSearchParams({
    id,
    reference: finalReference,
    amount,
    additionalinfo: finalInfo,
    returnurl: finalReturn,
    resulturl: finalResult,
    authemail: finalEmail,
    status: 'Message',
    hash
  });

  console.log("🚀 Sending to PayNow:", params.toString());

  try {
    const response = await axios.post(
      'https://www.paynow.co.zw/Interface/InitiateTransaction',
      params
    );

    const responseData = new URLSearchParams(response.data);
    const browserUrl = responseData.get('browserurl');
    const status = responseData.get('status');

    console.log("📥 PayNow Response:", response.data);

    if (status !== 'Ok' || !browserUrl) {
      console.error("❌ PayNow Error:", response.data);
      return res.status(500).json({
        error: 'PayNow returned an error',
        details: response.data
      });
    }

    res.json({ url: browserUrl });
  } catch (error) {
    console.error('🔥 Axios/PayNow failure:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create PayNow order' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Paynow server running on port ${port}`);
});
