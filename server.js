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

// ✅ SHA512 hash generator (raw values, no encoding)
function generateHash(values, integrationKey) {
  const rawString = values.join('') + integrationKey;
  console.log('\n🔍 STRING TO HASH (RAW):');
  console.log(rawString);
  return crypto.createHash('sha512').update(rawString, 'utf8').digest('hex').toUpperCase();
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
    const returnUrl = returnurl || 'https://sukaravtech.art/success';
    const resultUrl = resulturl || 'https://sukaravtech.art/paynow-status';
    const status = 'Message';
    const formattedAmount = parseFloat(amount).toFixed(2); // ensures 2 decimal places

    // ✅ Raw string for hash
    const valuesToHash = [id, ref, formattedAmount, info, returnUrl, resultUrl, status];
    const hash = generateHash(valuesToHash, key);

    // ✅ Final POST payload (no encoding!)
    const params = new URLSearchParams();
    params.append('id', id);
    params.append('reference', ref);
    params.append('amount', formattedAmount);
    params.append('additionalinfo', info);
    params.append('returnurl', returnUrl);
    params.append('resulturl', resultUrl);
    params.append('status', status);
    params.append('authemail', authemail);
    params.append('hash', hash);

    console.log('\n🚀 Final Parameters Sent to Paynow:');
    console.log(params.toString());

    // 🔁 Submit request to PayNow
    const response = await axios.post('https://www.paynow.co.zw/Interface/InitiateTransaction', params);
    const data = new URLSearchParams(response.data);
    const browserUrl = data.get('browserurl');
    const statusResp = data.get('status');

    console.log('\n📥 Paynow Raw Response:');
    console.log(response.data);

    if (statusResp !== 'Ok' || !browserUrl) {
      console.error('❌ Paynow Error:', response.data);
      return res.status(500).json({ error: 'Paynow returned an error', details: response.data });
    }

    res.json({ url: browserUrl });

  } catch (error) {
    console.error('🔥 Internal error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`🟢 Raven Paynow server running on port ${port}`);
});
