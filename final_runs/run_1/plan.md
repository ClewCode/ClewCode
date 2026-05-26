# Plan: Google Flights Search — SEA→JFK (Aug 15–20, 2026)

## Critical Points

1. **Launch Firefox** at 1280×1800 viewport, navigate to `https://www.google.com/travel/flights`
2. **Dismiss cookie/gdpr dialogs** if they appear (click "Accept all" or "Reject all")
3. **Enter departure airport** — click the "Where from?" field, type "SEA" (or "Seattle"), select the correct suggestion
4. **Enter destination airport** — click the "Where to?" field, type "JFK" (or "New York"), select the correct suggestion
5. **Set departure date** — click the departure date field, select August 15, 2026
6. **Set return date** — click the return date field, select August 20, 2026
7. **Explore** — click the "Explore" or search button to get results
8. **Capture results** — take a full-viewport screenshot and extract flight listings (price, airline, duration, stops)
9. **Log the action trace** to `final_script_log.txt`

## Verification

- Screenshot shows the Google Flights results page with flight options
- Log contains airline names, prices, durations, and layover info for the first several flights
