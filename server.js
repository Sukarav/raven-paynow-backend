app.post('/create-paynow-order', async (req, res) => {
  try {
    let {
      amount,
      reference,
      additionalinfo,
      returnurl,
      resulturl,
      description,
      email
    } = req.body;

    // ✅ Clean the amount to 2 decimal places (e.g., "2.69")
    amount = parseFloat(amount).toFixed(2);

    const id = process.env.PAYNOW_INTEGRATION_ID;
    const key = process.env.PAYNOW_INTEGRATION_KEY;
    const authemail = email || process.env.MERCHANT_EMAIL;

    const ref = reference || 'RAVEN_ORDER';
    const info = additionalinfo || description || 'Art Payment';
    const returnUrlRaw = 'https://sukaravtech.art/success';
    const resultUrlRaw = 'https://sukaravtech.art/paynow-status';
    const status = 'Message';

    const valuesToHash = [id, ref, amount, info, returnUrlRaw, resultUrlRaw, status];
    const hash = generateHash(valuesToHash, key);

    const params = new URLSearchParams();
    params.append('id', id);
    params.append('reference', ref);
    params.append('amount', amount);
    params.append('additionalinfo', info);
    params.append('returnurl', returnUrlRaw);
    params.append('resulturl', resultUrlRaw);
    params.append('status', status);
    params.append('authemail', authemail);
    params.append('hash', hash);

    console.log('🧪 Final Params Sent to Paynow:', params.toString());

    const response = await axios.post('https://www.paynow.co.zw/Interface/InitiateTransaction', params);
    const data = new URLSearchParams(response.data);
    const browserUrl = data.get('browserurl');
    const statusResp = data.get('status');

    console.log('📥 Paynow Raw Response:', response.data);

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
