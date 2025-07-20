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

// ✅ Correct SHA512 hash generator
function generateHash(values, integrationKey) {
  const rawString = values.join('');
  const finalString = rawString + integrationKey;
  console.log('🔍 Raw String for Hash:', finalString);
  const hash = crypto.createHash('sha512').update(finalString, 'utf8').digest('hex');
  return hash.toUpperCase();
}

app.post('/create-paynow-order', async (req, res) => {
  try {
    const {
      amount,
      reference = 'RAVEN_ORDER',
      additionalinfo = 'Art Payment',
      returnurl = 'https://sukaravtech.art/success',
      resulturl = 'https://sukaravtech.art/paynow-status',
      description,
      email
    } = req.body;

    const id = process.env.PAYNOW_INTEGRATION_ID;
    const key = process.env.PAYNOW_INTEGRATION_KEY;
    const authemail = email || process.env.MERCHANT_EMAIL;

    const formattedAmount = parseFloat(amount).toFixed(2);

    const valuesToHash = [
      id,
      reference,
      formattedAmount,
      additionalinfo || description,
      returnurl,
      resulturl,
      'Message'
    ];

    const hash = generateHash(valuesToHash, key);

    const params = new URLSearchParams({
      id,
      reference,
      amount: formattedAmount,
      additionalinfo: additionalinfo || description,
      returnurl,
      resulturl,
      status: 'Message',
      authemail,
      hash
    });

    console.log('📦 Final Parameters Sent to Paynow:', params.toString());

    const response = await axios.post('https://www.paynow.co.zw/Interface/InitiateTransaction', params);
    const data = new URLSearchParams(response.data);
    const browserUrl = data.get('browserurl');
    const statusResp = data.get('status');

    console.log('📥 Paynow Raw Response:', response.data);

    if (statusResp !== 'Ok' || !browserUrl) {
      console.error('❌ Paynow Error:', response.data);
      return res.status(500).json({ 
        error: 'Paynow returned an error', 
        details: response.data 
      });
    }

    res.json({ url: browserUrl });

  } catch (error) {
    console.error('🔥 Internal Server Error:', error.message);
    res.status(500).json({ 
      error: 'Internal Server Error', 
      details: error.message 
    });
  }
});

app.listen(port, () => {
  console.log(`🟢 Raven Paynow server running on port ${port}`);
});
