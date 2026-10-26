# Foggy Window

A small fogged-glass scene built with HTML, CSS, vanilla JavaScript, and the Canvas API. Drag with a mouse or touch the glass to clear a path; choose **Reset** to bring the condensation back. Select **Enable hand tracking**, allow camera access, then point with one finger or pinch and move to wipe without touching the screen.

## Run on Linux

Serve this folder locally (camera access is available on `localhost` or HTTPS):

```sh
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

The fallback landscape, condensation, and droplets are generated locally in canvas. Hand tracking uses MediaPipe Hands, loaded on demand from jsDelivr, plus its model file from Google Storage. Internet access is needed to start tracking. Camera frames are processed in the browser and are not sent to an app backend; MediaPipe's package may send usage metrics as described in its privacy notice. Touch and mouse wiping still work if the tracking assets cannot load.
