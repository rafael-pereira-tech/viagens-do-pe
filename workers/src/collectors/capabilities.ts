import type { Env } from '../env';

function truthy(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export type SourceCapability =
  | 'smiles_points'
  | 'gol_cash'
  | 'azul_points'
  | 'azul_cash'
  | 'latam_cash'
  | 'latam_pass_points';

/** Explicit flags win; legacy credentials remain a backwards-compatible enablement path. */
export function sourceEnabled(env: Env, capability: SourceCapability): boolean {
  const configured = (name: keyof Env): boolean => truthy(env[name] as string | undefined);
  switch (capability) {
    case 'smiles_points':
      return configured('SMILES_POINTS_ENABLED') || Boolean(env.SMILES_API_KEY?.trim() || env.SMILES_COOKIE?.trim() || env.SMILES_ACCESS_TOKEN?.trim());
    case 'gol_cash':
      return configured('GOL_CASH_ENABLED') || sourceEnabled(env, 'smiles_points');
    case 'azul_points':
      return configured('AZUL_POINTS_ENABLED') || Boolean(env.TUDOAZUL_LOGIN?.trim() && env.TUDOAZUL_PASSWORD);
    case 'azul_cash':
      return configured('AZUL_CASH_ENABLED') || Boolean(env.TUDOAZUL_LOGIN?.trim() && env.TUDOAZUL_PASSWORD);
    case 'latam_cash':
      return configured('LATAM_CASH_ENABLED') || Boolean(env.LATAM_PASS_LOGIN?.trim() && env.LATAM_PASS_PASSWORD);
    case 'latam_pass_points':
      return configured('LATAM_PASS_POINTS_ENABLED') || Boolean(env.LATAM_PASS_LOGIN?.trim() && env.LATAM_PASS_PASSWORD);
  }
}

export function anySourceEnabled(env: Env, ...capabilities: SourceCapability[]): boolean {
  return capabilities.some((capability) => sourceEnabled(env, capability));
}

export function hasExplicitCapabilityFlags(env: Env): boolean {
  return [
    'SMILES_POINTS_ENABLED',
    'GOL_CASH_ENABLED',
    'AZUL_POINTS_ENABLED',
    'AZUL_CASH_ENABLED',
    'LATAM_CASH_ENABLED',
    'LATAM_PASS_POINTS_ENABLED',
  ].some((name) => env[name as keyof Env] !== undefined);
}
