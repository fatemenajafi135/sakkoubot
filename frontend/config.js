window.SAKKOUBOT_API_BASE = (
  location.hostname === 'localhost' || location.hostname === '127.0.0.1'
) ? 'http://localhost:8000'
  : 'https://YOUR_BACKEND_VERCEL_URL'; // replace after deploying the backend
