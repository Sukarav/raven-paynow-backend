# Raven Paynow Backend

This is a Node.js Express server that generates secure Paynow payment URLs for integration with Voiceflow or other tools.

## To Deploy

1. Set your `.env` with:
```
PAYNOW_INTEGRATION_ID=
PAYNOW_INTEGRATION_KEY=
```

2. Run the server:
```bash
npm install
npm start
```

3. Use POST `/create-paynow-link` with JSON body:
```json
{
  "amount": "10.00",
  "reference": "INV123",
  "email": "example@email.com"
}
```
