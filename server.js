const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// ✅ Correct hash generator (excluding authemail and hash itself)
function generateHash(values, integrationKey) {
  const rawString = values.join('') + integrationKey;
  const hash = crypto.createHash('sha512').update(rawString, 'utf8').digest('hex');
  return hash.toUpperCase(); // ✅ Must be UPPERCASE for PayNow
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

    const id = process.env.INTEGRATION_ID;
    const key = process.env.INTEGRATION_KEY;

    const ref = reference || 'RAVEN_ORDER';
    const info = additionalinfo || description || 'Art Payment';
    const returnUrl = returnurl || 'https://sukaravtech.art/success';
    const resultUrl = resulturl || 'https://sukaravtech.art/paynow-status';
    const status = 'Message';
    const authemail = email || process.env.MERCHANT_EMAIL || 'sukaravtech@gmail.com';

    // ✅ Proper hash string (NO authemail)
    const valuesToHash = [id, ref, amount, info, returnUrl, resultUrl, status];
    const hash = generateHash(valuesToHash, key);

    console.log('🧪 Raw string for hash:', valuesToHash.join(''));
    console.log('🔒 Final Hash (UPPERCASE):', hash);

    const params = new URLSearchParams();
    params.append('id', id);
    params.append('reference', ref);
    params.append('amount', amount);
    params.append('additionalinfo', info);
    params.append('returnurl', returnUrl);
    params.append('resulturl', resultUrl);
    params.append('status', status);
    params.append('authemail', authemail); // ✅ Present in payload, NOT in hash
    params.append('hash', hash);

    console.log('🚀 Sending to PayNow:', params.toString());

    const axios = require('axios');
    const response = await axios.post(
      'https://www.paynow.co.zw/Interface/InitiateTransaction',
      params
    );

    const data = new URLSearchParams(response.data);
    const browserUrl = data.get('browserurl');
    const statusResp = data.get('status');

    console.log('📥 PayNow Response:', response.data);

    if (statusResp !== 'Ok' || !browserUrl) {
      console.error('❌ PayNow Error:', response.data);
      return res.status(500).json({ error: 'PayNow returned an error', details: response.data });
    }

    res.json({ url: browserUrl });

  } catch (error) {
    console.error('🔥 Internal error during PayNow flow:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 Raven Paynow server running on port ${port}`);
});
