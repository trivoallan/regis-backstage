import { mockServices } from '@backstage/backend-test-utils';
import { readConfigPlaybooks } from './configPlaybooks';

describe('readConfigPlaybooks', () => {
  it('returns [] when regis.playbooks is absent', () => {
    const config = mockServices.rootConfig({ data: {} });
    expect(readConfigPlaybooks(config)).toEqual([]);
  });

  it('maps declared playbooks to ordered ladders (array order is the rank)', () => {
    const config = mockServices.rootConfig({
      data: {
        regis: {
          playbooks: [
            {
              id: 'default',
              title: 'Regis Default Playbook',
              version: '1.0.0',
              owner: 'team-platform',
              tiers: [
                { name: 'Gold', color: '#d4af37' },
                { name: 'Silver', color: '#9ca3af' },
                { name: 'Bronze', color: '#cd7f32' },
              ],
            },
            {
              id: 'pci-dss',
              title: 'PCI-DSS Hardened Playbook',
              version: '2.1.0',
              owner: 'team-payments',
              tiers: [
                { name: 'Platinum', color: '#7e57c2' },
                { name: 'Certified', color: '#26a69a' },
                { name: 'Provisional', color: '#ef6c00' },
              ],
            },
          ],
        },
      },
    });

    expect(readConfigPlaybooks(config)).toEqual([
      {
        id: 'default',
        title: 'Regis Default Playbook',
        version: '1.0.0',
        owner: 'team-platform',
        tiers: [
          { name: 'Gold', color: '#d4af37' },
          { name: 'Silver', color: '#9ca3af' },
          { name: 'Bronze', color: '#cd7f32' },
        ],
      },
      {
        id: 'pci-dss',
        title: 'PCI-DSS Hardened Playbook',
        version: '2.1.0',
        owner: 'team-payments',
        tiers: [
          { name: 'Platinum', color: '#7e57c2' },
          { name: 'Certified', color: '#26a69a' },
          { name: 'Provisional', color: '#ef6c00' },
        ],
      },
    ]);
  });

  it('tolerates a playbook with only an id and uncolored tiers', () => {
    const config = mockServices.rootConfig({
      data: { regis: { playbooks: [{ id: 'p', tiers: [{ name: 'A' }] }] } },
    });
    expect(readConfigPlaybooks(config)).toEqual([
      { id: 'p', tiers: [{ name: 'A' }] },
    ]);
  });
});
