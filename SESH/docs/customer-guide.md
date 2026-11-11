# Customer Guide: Use SESH

SESH helps you visualize your Spotify listening history from your Spotify data export ZIP.

## What you need

- Your Spotify export ZIP file, typically named `my_spotify_data.zip`
- A modern desktop browser (Chrome, Edge, Safari, Firefox)

## Privacy and processing

SESH currently processes your ZIP in your browser (client-side). This means:

- Your file is parsed locally
- You do not need to upload data to a backend service for processing

Note: your browser may still keep temporary local memory while processing. Close/reload the tab to clear the active session.

## Start using SESH

1. Open the app URL provided by your team.
2. On the upload screen, drag and drop `my_spotify_data.zip`, or click **Choose file**.
3. Wait for processing to finish. You will see status updates such as unzip, parse, and aggregate.
4. Review your dashboard once processing completes.

## What you can view

SESH currently shows:

- Top songs
- Top albums
- Top artists

Across:

- Last 1 month
- Last 1 year
- Last 5 years
- All-time
- Any available calendar year in your data

You can switch:

- Entity type (Songs / Albums / Artists)
- Time scope (window or year)

## Understanding the numbers

- Rankings are based primarily on total listening time (`ms_played`)
- Play count is also shown in detail tables
- Non-music entries (podcasts/audiobooks) are filtered out in this view

## Typical processing time

Depends on ZIP size and computer speed:

- Small exports: a few seconds
- Large extended history exports: up to a few minutes

The app remains responsive because parsing runs in a background worker.

## Troubleshooting

### “No Streaming_History_Audio files found”

Your ZIP may not include the expected Spotify audio history files. Confirm your export includes `Streaming_History_Audio_*.json`.

### Processing fails

Try:

- Reloading the page
- Re-downloading your Spotify export ZIP
- Using a different browser

### Dashboard looks sparse

Possible reasons:

- The selected time window is narrow
- The export has limited history
- Data is mostly non-music entries for that period

Switch to **All-time** or a different calendar year to compare.

## Mock mode

You may see a **mock mode** option in some environments. This is for demos/testing and does not use your personal ZIP data.
