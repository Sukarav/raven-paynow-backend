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

// ✅ Generate SHA512 Hash (PayNow requires UPPERCASE hash)
function generateHash(values, integrationKey) {
  const rawString = values.join('') + integrationKey;
  console.log('🧪 Hash input string:', rawString); // Debug
  const hash = crypto.createHash('sha512').update(rawString, 'utf8').digest('hex');
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

    // ✅ ENV Vars
    const id = process.env.INTEGRATION_ID;
    const key = process.env.INTEGRATION_KEY;
    const authemail = email || process.env.MERCHANT_EMAIL || 'sukaravtech@gmail.com';

    // ✅ Final formatted params
    const ref       = reference || 'RAVEN_ORDER';
    const info      = additionalinfo || description || 'Art Payment';
    const returnUrl = returnurl || 'https://sukaravtech.art/success';
    const resultUrl = resulturl || 'https://sukaravtech.art/paynow-status';
    const status    = 'Message';

    // ✅ Hash Generation (do NOT include email in hash)
    const hashFields = [id, ref, amount, info, returnUrl, resultUrl, status];
    const hash = generateHash(hashFields, key);

    console.log('🔐 Final Hash (UPPERCASE):', hash);

    // ✅ Set up PayNow payload
    const params = new URLSearchParams();
    params.append('id', id);
    params.append('reference', ref);
    params.append('amount', amount);
    params.append('additionalinfo', info);
    params.append('returnurl', returnUrl);
    params.append('resulturl', resultUrl);
    params.append('status', status);
    params.append('authemail', authemail); // not part of hash
    params.append('hash', hash);

    console.log('📤 Sending to PayNow:', params.toString());

    // ✅ Send to PayNow
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
      return res.status(500).json({
        error: 'PayNow returned an error',
        details: response.data
      });
    }

    // ✅ Respond with PayNow redirect URL
    res.json({ url: browserUrl });

  } catch (error) {
    console.error('🔥 Internal error during PayNow flow:', error?.response?.data || error.message);
    res.status(500).json({
      error: 'Internal server error',
      details: error?.response?.data || error.message
    });
  }
});

app.listen(port, () => {
  console.log(`🚀 PayNow server running on port ${port}`);
});
