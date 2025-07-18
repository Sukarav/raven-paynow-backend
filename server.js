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

// Generate SHA512 hash for Paynow
function generateHash(values) {
  const stringToHash = values.join('');
  return crypto.createHash('sha512').update(stringToHash).digest('hex');
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

  const valuesToHash = [
    id,
    finalReference,
    amount,
    finalInfo,
    finalReturn,
    finalResult,
    key
  ];

  const hash = generateHash(valuesToHash);

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

  try {
    const response = await axios.post(
      'https://www.paynow.co.zw/Interface/InitiateTransaction',
      params
    );

    const responseData = new URLSearchParams(response.data);
    const browserUrl = responseData.get('browserurl');
    const status = responseData.get('status');

    if (status !== 'Ok' || !browserUrl) {
      return res.status(500).json({
        error: 'PayNow returned an error',
        details: response.data
      });
    }

    res.json({ url: browserUrl });
  } catch (error) {
    console.error('PayNow error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create PayNow order' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Paynow server running on port ${port}`);
});
