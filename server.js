# Endpoint (Render)
$endpoint = "https://raven-paynow-backend.onrender.com/create-paynow-order"

# JSON payload for Express Checkout
$body = @{
    amount         = "0.69"
    reference      = "TEST-EXPRESS-" + (Get-Date -Format "yyyyMMddHHmmss")
    additionalinfo = "Express Checkout Test"
    returnurl      = "https://sukaravtech.art/success"
    resulturl      = "https://sukaravtech.art/paynow-status"
    method         = "ecocash"
    phone          = "263779307353"   # ✅ Correct format for Paynow
} | ConvertTo-Json -Depth 3

# Send POST request
try {
    $response = Invoke-RestMethod -Uri $endpoint -Method Post -Body $body -ContentType "application/json"
    Write-Host "`n✅ PayNow Express Checkout Initiated!" -ForegroundColor Green
    $response
} catch {
    Write-Host "`n❌ Failed:" -ForegroundColor Red
    $_
}
