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

// ✅ Hash function (excludes authemail + hash field)
function generateHash(values, integrationKey) {
  const rawString = values.join('');
  const finalString = rawString + integrationKey;

  console.log('\n🔍 RAW STRING TO HASH (BEFORE HASHING):');
  console.log(finalString); // for debugging

  const hash = crypto.createHash('sha512').update(finalString, 'utf8').digest('hex');
  return hash.toUpperCase(); // required by Paynow
}

// ✅ Safe decoding function to avoid decodeURIComponent crash
function safeDecode(url) {
  try {
    return decodeURIComponent(url);
  } catch {
    return url;
  }
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
    const returnUrl = safeDecode(returnurl || 'https://sukaravtech.art/success');
    const resultUrl = safeDecode(resulturl || 'https://sukaravtech.art/paynow-status');
    const status = 'Message';

    // ✅ Hash computation (Paynow expects this exact order)
    const valuesToHash = [id, ref, amount, info, returnUrl, resultUrl, status];
    const hash = generateHash(valuesToHash, key);

    // ✅ Build request payload
    const params = new URLSearchParams();
    params.append('id', id);
    params.append('reference', ref);
    params.append('amount', amount);
    params.append('additionalinfo', info);
    params.append('returnurl', returnUrl);
    params.append('resulturl', resultUrl);
    params.append('status', status);
    params.append('authemail', authemail);
    params.append('hash', hash);

    console.log('\n🧪 Final Params Sent to Paynow:', params.toString());

    // ✅ Make Paynow request
    const response = await axios.post('https://www.paynow.co.zw/Interface/InitiateTransaction', params);
    const data = new URLSearchParams(response.data);
    const browserUrl = data.get('browserurl');
    const statusResp = data.get('status');

    console.log('\n📥 Paynow Raw Response:', response.data);

    if (statusResp !== 'Ok' || !browserUrl) {
      console.error('❌ Paynow Error:', response.data);
      return res.status(500).json({ error: 'Paynow returned an error', details: response.data });
    }

    res.json({ url: browserUrl });

  } catch (error) {
    console.error('\n🔥 Internal server error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`🟢 Raven Paynow server running on port ${port}`);
});
