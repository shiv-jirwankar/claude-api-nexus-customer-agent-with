# Nexus Technical Solutions

## Login & Authentication Issues
- Clear browser cache and cookies (Ctrl+Shift+Delete)
- Try incognito/private browsing mode
- Disable browser extensions one by one
- Confirm Caps Lock is off
- Password reset links expire after 24 hours — request fresh link if old
- For SSO issues: confirm identity provider is reachable at org domain
- MFA device lost: verify identity via email + phone, then disable MFA temporarily

## Dashboard Performance
- Peak load hours: 9-11am IST, 2-4pm EST — advise retry
- Clear localStorage: DevTools > Application > Local Storage > Clear
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Disable ad blockers — known to interfere with dashboard WebSocket connections

## API Issues
- Rate limits: 1000 req/min (Pro), 100 req/min (Free), 10000 req/min (Enterprise)
- 429 errors: implement exponential backoff starting at 1 second
- 503 errors: check status.nexus.io — likely a known incident
- API keys: rotate every 90 days, never expose in client-side code

## Billing Issues  
- Invoice disputes: submit within 30 days with usage screenshot
- Failed payments: 3-day grace period, update card at Settings > Billing
- Plan upgrades: take effect immediately, prorated billing
- Cancellations: effective end of billing period, data retained 90 days