// Builds a small, self-contained HTML page that runs Google's invisible reCAPTCHA via the
// Firebase Auth *compat* SDK (loaded from Firebase's own CDN) and posts the resulting
// verification token back to React Native. This exists instead of the unmaintained
// `expo-firebase-recaptcha` package (which drags in a years-old, vulnerable dependency
// chain) — it's the same underlying mechanism Firebase's JS SDK needs for phone auth on a
// platform with no native app-verification path (no DOM), just implemented directly.
export function buildRecaptchaHtml(firebaseConfig: Record<string, string>): string {
  const configJson = JSON.stringify(firebaseConfig);
  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no" />
  <style>
    html, body { margin: 0; padding: 0; background: transparent; }
    #recaptcha-container { display: flex; align-items: center; justify-content: center; padding-top: 24px; }
  </style>
</head>
<body>
  <div id="recaptcha-container"></div>
  <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js"></script>
  <script>
    function post(message) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      }
    }

    window.onerror = function (message) {
      post({ type: 'error', message: String(message) });
      return true;
    };

    try {
      firebase.initializeApp(${configJson});
      window.verifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        size: 'invisible',
        callback: function (token) {
          post({ type: 'token', token: token });
        },
        'expired-callback': function () {
          post({ type: 'expired' });
        },
      });

      window.runVerify = function () {
        window.verifier.verify().then(function (token) {
          post({ type: 'token', token: token });
        }).catch(function (err) {
          post({ type: 'error', message: err && err.message ? err.message : String(err) });
        });
      };

      post({ type: 'ready' });
    } catch (e) {
      post({ type: 'error', message: e && e.message ? e.message : String(e) });
    }
  </script>
</body>
</html>`;
}
