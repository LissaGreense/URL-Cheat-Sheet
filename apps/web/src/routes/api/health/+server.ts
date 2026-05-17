import { json } from '@sveltejs/kit';

/**
 * Liveness probe. Returns the package version so deploy smoke tests can
 * detect rollouts.
 */
export function GET(): Response {
  return json({
    status: 'ok',
    version: '0.0.0'
  });
}
