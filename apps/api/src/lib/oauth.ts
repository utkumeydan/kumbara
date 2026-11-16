import { createRemoteJWKSet, jwtVerify } from 'jose';
import { HTTPException } from 'hono/http-exception';

const PROVIDERS = {
  google: {
    jwks: createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')),
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: () => (process.env.GOOGLE_CLIENT_IDS ?? '').split(',').filter(Boolean),
  },
  apple: {
    jwks: createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')),
    issuer: ['https://appleid.apple.com'],
    audience: () => (process.env.APPLE_CLIENT_IDS ?? '').split(',').filter(Boolean),
  },
};

export type Provider = keyof typeof PROVIDERS;

export function providerEnabled(p: Provider) {
  return PROVIDERS[p].audience().length > 0;
}

// Sağlayıcının imzaladığı kimlik anahtarını doğrular
export async function verifyIdToken(provider: Provider, idToken: string) {
  const p = PROVIDERS[provider];
  const audience = p.audience();
  if (!audience.length) throw new HTTPException(400, { message: 'Bu giriş yöntemi sunucuda yapılandırılmamış' });
  try {
    const { payload } = await jwtVerify(idToken, p.jwks, { issuer: p.issuer, audience });
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
    const verified = payload.email_verified === true || payload.email_verified === 'true';
    return { subject: String(payload.sub), email: verified ? email : null, name: typeof payload.name === 'string' ? payload.name : null };
  } catch {
    throw new HTTPException(401, { message: 'Kimlik doğrulanamadı' });
  }
}
