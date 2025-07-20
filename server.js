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
  const finalString = values.join('') + integrationKey;
  console.log('\n🔍 RAW STRING TO HASH:', finalString);
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

    const id = process.env.PAYNOW_INTEGRATION_ID.trim();
    const key = process.env.PAYNOW_INTEGRATION_KEY.trim();
    const authemail = (email || process.env.MERCHANT_EMAIL).trim();

    const ref = (reference || 'RAVEN_ORDER').trim();
    const info = (additionalinfo || description || 'Art Payment').trim();

    const returnUrlRaw = (returnurl || 'https://sukaravtech.art/success').trim();
    const resultUrlRaw = (resulturl || 'https://sukaravtech.art/paynow-status').trim();
    const status = 'Message';

    const valuesToHash = [id, ref, amount, info, returnUrlRaw, resultUrlRaw, status];
    const hash = generateHash(valuesToHash, key);

    const params = new URLSearchParams({
      id,
      reference: ref,
      amount,
      additionalinfo: info,
      returnurl: returnUrlRaw,     
      resulturl: resultUrlRaw,    
      status,
      authemail,
      hash
    });

    console.log('\n🚀 Final Params Sent to Paynow:', params.toString());

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
    console.error('🔥 Internal error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`🟢 Raven Paynow server running on port ${port}`);
});
