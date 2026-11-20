export function normalizeHfToken(value) {
  const token = String(value || '').trim();
  if (!/^hf_[A-Za-z0-9_-]+$/.test(token)) throw new Error('HF_TOKEN format is invalid. Edit the GitHub Actions secret and paste the full hf_ token VALUE copied from Hugging Face, without quotes. Token names and account passwords cannot be used.');
  return token;
}

export async function verifyHfIdentity(token, request = fetch) {
  const response = await request('https://huggingface.co/api/whoami-v2', {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000),
  });
  if (response.status === 401) throw new Error('HF_TOKEN was rejected by Hugging Face (HTTP 401). It may be incomplete, revoked or expired. Replace the GitHub secret with a valid token VALUE from the LEEsufegyw3w8 account.');
  if (response.status === 403) throw new Error('Hugging Face refused the token identity check (HTTP 403). Review the token permissions.');
  if (!response.ok) throw new Error(`Hugging Face identity check returned HTTP ${response.status}; retry if the service is temporarily unavailable.`);
  const identity = await response.json();
  if (identity.name !== 'LEEsufegyw3w8') throw new Error('HF_TOKEN belongs to another Hugging Face account. Use a token from LEEsufegyw3w8 for this Space.');
  if (identity.auth?.accessToken?.role === 'read') throw new Error('HF_TOKEN is read-only. Grant read and write access to LEEsufegyw3w8/Taiwan-ETF-Planner.');
}
