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

// ✅ SHA512 HASH GENERATOR (correct order + uppercase)
function generateHash(values, integrationKey) {
  const rawString = values.join('') + integrationKey;
  console.log('\n🔍 RAW STRING TO HASH:');
  console.log(rawString);

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

    // ✅ Env values
    const id = process.env.PAYNOW_INTEGRATION_ID;
    const key = process.env.PAYNOW_INTEGRATION_KEY;
    const authemail = email || process.env.MERCHANT_EMAIL;

    // ✅ Fields to use (falling back to sensible defaults)
    const ref = reference || 'RAVEN_ORDER';
    const info = additionalinfo || description || 'Art Payment';
    const returnUrlRaw = returnurl || 'https://sukaravtech.art/success';
    const resultUrlRaw = resulturl || 'https://sukaravtech.art/paynow-status';
    const status = 'Message';

    // ✅ Final hash input
    const valuesToHash = [id, ref, amount, info, returnUrlRaw, resultUrlRaw, status];
    const hash = generateHash(valuesToHash, key);

    // ✅ Prepare payload
    const params = new URLSearchParams();
    params.append('id', id);
    params.append('reference', ref);
    params.append('amount', amount); // must be string format
    params.append('additionalinfo', info);
    params.append('returnurl', returnUrlRaw);
    params.append('resulturl', resultUrlRaw);
    params.append('status', status);
    params.append('authemail', authemail);
    params.append('hash', hash); // ✅ Last

    // ✅ Log full outgoing payload
    console.log('\n📤 Final Params Sent to Paynow:\n' + params.toString());

    const response = await axios.post(
      'https://www.paynow.co.zw/Interface/InitiateTransaction',
      params
    );

    const data = new URLSearchParams(response.data);
    const browserUrl = data.get('browserurl');
    const statusResp = data.get('status');

    console.log('\n📥 Paynow Raw Response:\n', response.data);

    if (statusResp !== 'Ok' || !browserUrl) {
      console.error('\n❌ Paynow Error:\n', response.data);
      return res.status(500).json({ error: 'Paynow returned an error', details: response.data });
    }

    res.json({ url: browserUrl });

  } catch (error) {
    console.error('\n🔥 Internal server error:\n', error?.response?.data || error.message);
    res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`\n🟢 Raven Paynow server running on port ${port}`);
});
