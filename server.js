const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

app.post("/create-paynow-link", (req, res) => {
    const { amount, reference, email } = req.body;

    const integrationId = process.env.PAYNOW_INTEGRATION_ID;
    const integrationKey = process.env.PAYNOW_INTEGRATION_KEY;

    if (!amount || !reference || !email) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    const url = "https://www.paynow.co.zw/interface/initiatetransaction";

    const values = {
        id: integrationId,
        reference,
        amount,
        additionalinfo: "Payment via Raven AI",
        returnurl: "https://example.com/return",
        resulturl: "https://example.com/result",
        status: "Message",
        email
    };

    const hashString = Object.values(values).join("") + integrationKey;
    const hash = crypto.createHash("sha512").update(hashString).digest("hex");

    const params = new URLSearchParams(values);
    params.append("hash", hash);

    const finalUrl = \`\${url}?\${params.toString()}\`;

    res.json({ url: finalUrl });
});

app.listen(PORT, () => {
    console.log(\`🚀 Paynow server running on port \${PORT}\`);
});
