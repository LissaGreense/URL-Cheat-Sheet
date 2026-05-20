/**
 * @fileoverview Contract tests for AtmosphereShell — verifies the 5-layer
 * z-ordered atmosphere stack renders and that arbitrary children are
 * composed above the layers (spec §2.3).
 *
 * The five layers required by the spec are:
 *   1. base body gradient
 *   2. ambient driver
 *   3. glow pads
 *   4. spec dots
 *   5. HUD chrome  (scanline + cursor-halo in our static Phase 1 split)
 *
 * In Phase 1 these are static — no `@keyframes`. The test asserts
 * structural presence + z-ordering only; Phase 2 will own the motion
 * contract.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import AtmosphereShell from './AtmosphereShell.svelte';
import AtmosphereShellWithChild from './AtmosphereShell.test-host.svelte';

afterEach(() => {
  cleanup();
});

describe('AtmosphereShell', () => {
  it('renders the 5 atmosphere layers', () => {
    const { container } = render(AtmosphereShell);
    expect(container.querySelector('.atmosphere__base')).not.toBeNull();
    expect(container.querySelector('.atmosphere__ambient')).not.toBeNull();
    expect(container.querySelector('.atmosphere__glow-pad')).not.toBeNull();
    expect(container.querySelector('.atmosphere__spec-dot')).not.toBeNull();
    expect(container.querySelector('.atmosphere__scanline')).not.toBeNull();
  });

  it('includes the cursor-halo placeholder layer (Phase 2 wires motion)', () => {
    const { container } = render(AtmosphereShell);
    expect(container.querySelector('.atmosphere__cursor-halo')).not.toBeNull();
  });

  it('wraps the layers in the .atmosphere root container', () => {
    const { container } = render(AtmosphereShell);
    const root = container.querySelector('.atmosphere');
    expect(root).not.toBeNull();
    // All five named layers must be descendants of the root container.
    expect(root!.querySelector('.atmosphere__base')).not.toBeNull();
    expect(root!.querySelector('.atmosphere__ambient')).not.toBeNull();
    expect(root!.querySelector('.atmosphere__glow-pad')).not.toBeNull();
    expect(root!.querySelector('.atmosphere__spec-dot')).not.toBeNull();
    expect(root!.querySelector('.atmosphere__scanline')).not.toBeNull();
  });

  it('renders provided children above the atmosphere layers', () => {
    const { getByTestId, container } = render(AtmosphereShellWithChild);
    const child = getByTestId('atmosphere-child');
    expect(child).toBeTruthy();
    expect(child.textContent).toContain('payload');
    // Child must not live inside any of the layer divs — it sits above them.
    expect(child.closest('.atmosphere__base')).toBeNull();
    expect(child.closest('.atmosphere__ambient')).toBeNull();
    expect(child.closest('.atmosphere__glow-pad')).toBeNull();
    expect(child.closest('.atmosphere__spec-dot')).toBeNull();
    expect(child.closest('.atmosphere__scanline')).toBeNull();
    // But it should still be inside the overall .atmosphere container.
    expect(container.querySelector('.atmosphere')).not.toBeNull();
  });
});
