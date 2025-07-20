const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
app.use(bodyParser.json());

// ✅ Proper SHA512 hash generator
function generateHash(values, integrationKey) {
  const rawString = values.join('');
  console.log('\n🔍 String to Hash:', rawString + integrationKey);
  const hash = crypto.createHash('sha512').update(rawString + integrationKey, 'utf8').digest('hex');
  return hash.toUpperCase();
}

app.post('/create-paynow-order', async (req, res) => {
  try {
    const {
      amount,
      reference,
      additionalinfo,
      returnurl,
      resulturl,
      description,
      email
    } = req.body;

    const id = process.env.PAYNOW_INTEGRATION_ID;
    const key = process.env.PAYNOW_INTEGRATION_KEY;
    const authemail = email || process.env.MERCHANT_EMAIL;

    const ref = reference || 'RAVEN_ORDER';
    const info = additionalinfo || description || 'Art Payment';
    const returnUrlRaw = 'https://sukaravtech.art/success';
    const resultUrlRaw = 'https://sukaravtech.art/paynow-status';
    const status = 'Message';

    // ✅ Hash uses RAW, not encoded
    const valuesToHash = [id, ref, amount, info, returnUrlRaw, resultUrlRaw, status];
    const hash = generateHash(valuesToHash, key);

    const params = new URLSearchParams();
    params.append('id', id);
    params.append('reference', ref);
    params.append('amount', amount);
    params.append('additionalinfo', info);
    params.append('returnurl', returnUrlRaw);       // use raw string
    params.append('resulturl', resultUrlRaw);       // use raw string
    params.append('status', status);
    params.append('authemail', authemail);
    params.append('hash', hash);

    console.log('🚀 Final Parameters Sent to Paynow:\n' + params.toString());

    const response = await axios.post('https://www.paynow.co.zw/Interface/InitiateTransaction', params);
    const data = new URLSearchParams(response.data);
    const browserUrl = data.get('browserurl');
    const statusResp = data.get('status');

    console.log('📥 Paynow Raw Response:', response.data);

    if (statusResp !== 'Ok' || !browserUrl) {
      console.error('❌ Paynow Error:', response.data);
      return res.status(500).json({ error: 'Paynow returned an error', details: response.data });
    }

    res.json({ url: browserUrl });

  } catch (error) {
    console.error('🔥 Server Error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`🟢 Raven Paynow server running on port ${port}`);
});
