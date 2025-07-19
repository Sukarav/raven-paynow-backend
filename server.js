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

// ✅ Hash Generator
function generateHash(values, integrationKey) {
  const rawString = values.join('') + integrationKey;
  console.log("🧪 Raw string for hash:", rawString);
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

    // ✅ SUKARAV Credentials
    const id = "21458";
    const key = "a35a82b3-aa73-4839-90bd-aa2eb655c9de";
    const authemail = email || "sukaravtech@gmail.com";

    const ref       = reference || "RAVEN_ORDER";
    const info      = additionalinfo || description || "Glow Preview";
    const returnUrl = returnurl || "https://sukaravtech.art/success";
    const resultUrl = resulturl || "https://sukaravtech.art/paynow-status";
    const status    = "Message";

    // ✅ Hash values in exact order
    const hashFields = [id, ref, amount, info, returnUrl, resultUrl, status];
    const hash = generateHash(hashFields, key);

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

    console.log('🚀 Sending to PayNow:', params.toString());

    const response = await axios.post(
      'https://www.paynow.co.zw/Interface/InitiateTransaction',
      params
    );

    const data = new URLSearchParams(response.data);
    const browserUrl = data.get('browserurl');
    const statusResp = data.get('status');

    console.log('📥 PayNow Response:', response.data);

    if (statusResp !== 'Ok' || !browserUrl) {
      return res.status(500).json({ error: 'PayNow error', details: response.data });
    }

    res.json({ url: browserUrl });

  } catch (error) {
    console.error('🔥 Error:', error?.response?.data || error.message);
    res.status(500).json({ error: 'Internal error', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 Raven PayNow server running on port ${port}`);
});
