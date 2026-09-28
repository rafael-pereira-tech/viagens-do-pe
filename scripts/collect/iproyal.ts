/** Sticky Brazilian residential proxy. Credentials stay in the shell, never in git. */
export interface IproyalProxy {
  server: string;
  username: string;
  password: string;
}

export function iproyalProxy(): IproyalProxy | null {
  const username = process.env.IPROYAL_USER ?? '';
  const pass = process.env.IPROYAL_PASS ?? '';
  if (!username && !pass) return null;
  if (!username || !pass) throw new Error('set both IPROYAL_USER and IPROYAL_PASS');
  const session = process.env.IPROYAL_SESSION ?? '';
  if (!/^[a-zA-Z0-9]{8}$/.test(session)) {
    throw new Error('IPROYAL_SESSION must be 8 alphanumeric characters');
  }
  return {
    server: 'http://geo.iproyal.com:12321',
    username,
    password: [pass, 'country-br', `session-${session}`, 'lifetime-30m'].join('_'),
  };
}

export function requireIproyalProxy(): IproyalProxy {
  const proxy = iproyalProxy();
  if (!proxy) throw new Error('set IPROYAL_USER, IPROYAL_PASS and IPROYAL_SESSION');
  return proxy;
}

export function scrub(text: string): string {
  return text.replace(/:\/\/[^/\s@]+@/g, '://***@').slice(0, 180);
}
