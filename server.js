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

// ✅ Generate SHA512 UPPERCASE hash from raw string + integration key
function generateHash(values, integrationKey) {
  const rawString = values.join('');
  const finalString = rawString + integrationKey;

  console.log('\n🧮 RAW STRING TO HASH:');
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
      returnurl,    // Not used
      resulturl,    // Not used
      description,
      email
    } = req.body;

    // ✅ ENV VARIABLES
    const id = process.env.PAYNOW_INTEGRATION_ID;
    const key = process.env.PAYNOW_INTEGRATION_KEY;
    const authemail = email || process.env.MERCHANT_EMAIL || 'sukaravtech@gmail.com';

    // ✅ REQUIRED VALUES
    if (!amount) return res.status(400).json({ error: 'Amount is required' });

    const ref = reference || 'RAVEN_ORDER';
    const info = additionalinfo || description || 'Art Payment';

    const returnUrlRaw = 'https://sukaravtech.art/success';
    const resultUrlRaw = 'https://sukaravtech.art/paynow-status';

    const valuesToHash = [id, ref, amount, info, returnUrlRaw, resultUrlRaw, status];
    const hash = generateHash(valuesToHash, key);

    const params = new URLSearchParams();
    params.append('id', id);
    params.append('reference', ref);
    params.append('amount', amount);
    params.append('additionalinfo', info);
    params.append('returnurl', returnUrlRaw);      // ✅ RAW VALUE (not encoded)
    params.append('resulturl', resultUrlRaw);      // ✅ RAW VALUE (not encoded)
    params.append('status', status);
    params.append('authemail', authemail);
    params.append('hash', hash);

    console.log('\n🚀 Final Parameters Sent to Paynow:\n' + params.toString());

    // ✅ Send request to Paynow
    const response = await axios.post('https://www.paynow.co.zw/Interface/InitiateTransaction', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const data = new URLSearchParams(response.data);
    const browserUrl = data.get('browserurl');
    const statusResp = data.get('status');

    console.log('\n📥 Paynow Raw Response:\n' + response.data);

    if (statusResp !== 'Ok' || !browserUrl) {
      console.error('\n❌ Paynow Error:\n' + response.data);
      return res.status(500).json({
        error: 'Paynow returned an error',
        details: response.data,
        paynowStatus: statusResp
      });
    }

    // ✅ Respond with payment URL
    res.json({
      url: browserUrl,
      reference: ref,
      amount: amount
    });

  } catch (error) {
    console.error('\n🔥 Server Error:', error?.response?.data || error.message);
    res.status(500).json({
      error: 'Server error',
      details: error.message,
      responseData: error?.response?.data || null
    });
  }
});

app.listen(port, () => {
  console.log(`\n🟢 Raven Paynow server running on port ${port}`);
});
