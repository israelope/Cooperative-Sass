import 'server-only';

/**
 * One validated source for absolute links we put in emails, redirects and Paystack callbacks.
 * Local development may omit the variable; production must provide an https origin.
 */
export function getAppUrl() {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('NEXT_PUBLIC_APP_URL must be set in production.');
    }
    return 'http://localhost:3000';
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('NEXT_PUBLIC_APP_URL must be an absolute URL (for example https://app.example.com).');
  }
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('NEXT_PUBLIC_APP_URL must use https in production.');
  }
  return url.origin;
}
