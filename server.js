const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const app = express(); // ✅ Fixed: this line was missing.
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// ✅ SHA512 hash generation (excluding authemail and hash)
function generateHash(values, integrationKey) {
  const rawString = values.join('');
  const finalString = rawString + integrationKey;
  console.log('\n🔍 RAW STRING TO HASH (BEFORE HASHING):');
  console.log(finalString); 

  const hash = crypto.createHash('sha512').update(finalString, 'utf8').digest('hex');
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

    // ✅ Use raw URL strings
    const returnUrlRaw = 'https://sukaravtech.art/success';
    const resultUrlRaw = 'https://sukaravtech.art/paynow-status';
    const status = 'Message';

    const ref = reference || 'RAVEN_ORDER';
    const info = additionalinfo || description || 'Art Payment';

    // ✅ Raw string for hash generation
    const valuesToHash = [id, ref, amount, info, returnUrlRaw, resultUrlRaw, status];
    const hash = generateHash(valuesToHash, key);

    // ✅ Params for Paynow (URLs encoded here, not in hash)
    const params = new URLSearchParams();
    params.append('id', id);
    params.append('reference', ref);
    params.append('amount', amount);
    params.append('additionalinfo', info);
    params.append('returnurl', returnUrlRaw);
    params.append('resulturl', resultUrlRaw);
    params.append('status', status);
    params.append('authemail', authemail); // ✅ include in payload (not hash!)
    params.append('hash', hash); // ✅ last param

    console.log('🧪 Final Params Sent to Paynow:', params.toString());

    const response = await axios.post('https://www.paynow.co.zw/Interface/InitiateTransaction', params);
    const data = new URLSearchParams(response.data);
    const browserUrl = data.get('browserurl');
    const statusResp = data.get('status');

    console.log('📥 Paynow Raw Response:', response.data);

    if (statusResp !== 'Ok' || !browserUrl) {
      console.error('❌ Paynow Error:', response.data);
      return res.status(500).json({ error: 'Paynow error', details: response.data });
    }

    res.json({ url: browserUrl });

  } catch (error) {
    console.error('🔥 Internal server error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`🟢 Raven Paynow server running on port ${port}`);
});
