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

// ✅ Generate PayNow-compliant UPPERCASE SHA512 hash
function generateHash(id, reference, amount, info, returnUrl, resultUrl, key) {
  const rawString = `${id}${reference}${amount}${info}${returnUrl}${resultUrl}Message${key}`;
  console.log("🧪 Hash input string:", rawString);
  const hash = crypto.createHash('sha512').update(rawString, 'utf8').digest('hex').toUpperCase();
  console.log("🔐 Final Hash (UPPERCASE):", hash);
  return hash;
}

app.post('/create-paynow-order', async (req, res) => {
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

  const finalReference = reference || 'RAVEN_ORDER';
  const finalInfo = additionalinfo || description || 'Art Payment';
  const finalReturn = returnurl || 'https://example.com/return';
  const finalResult = resulturl || 'https://example.com/result';
  const finalEmail = email || process.env.MERCHANT_EMAIL || 'buyer@example.com';

  const hash = generateHash(
    id,
    finalReference,
    amount,
    finalInfo,
    finalReturn,
    finalResult,
    key
  );

  // ✅ Fixed parameter order
const params = new URLSearchParams();
params.append('id', id);
params.append('reference', finalReference);
params.append('amount', amount);
params.append('additionalinfo', finalInfo);
params.append('returnurl', finalReturn);
params.append('resulturl', finalResult);
params.append('status', 'Message');           // ✅ BEFORE authemail
params.append('authemail', finalEmail);
params.append('hash', hash);                  // ✅ Always last


  console.log("🚀 Sending to PayNow:", params.toString());

  try {
    const response = await axios.post(
      'https://www.paynow.co.zw/Interface/InitiateTransaction',
      params.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const responseData = new URLSearchParams(response.data);
    const browserUrl = responseData.get('browserurl');
    const status = responseData.get('status');

    console.log("📥 PayNow Response:", response.data);

    if (status !== 'Ok' || !browserUrl) {
      console.error("❌ PayNow Error:", response.data);
      return res.status(500).json({
        error: 'PayNow returned an error',
        details: response.data
      });
    }

    res.json({ url: browserUrl });
  } catch (error) {
    console.error('🔥 Axios/PayNow failure:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create PayNow order' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Paynow server running on port ${port}`);
});
