import type { Entity } from '@backstage/catalog-model';
import { processingResult } from '@backstage/plugin-catalog-node';
import { RegisAliasRelationProcessor } from './RegisAliasRelationProcessor';

const processor = new RegisAliasRelationProcessor();
const loc = { type: 'url', target: 'x' };

function imageEntity(annotations: Record<string, string>): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Resource',
    metadata: { name: 'lib-nginx-1-27', namespace: 'default', annotations },
    spec: { type: 'container-image' },
  };
}

describe('RegisAliasRelationProcessor', () => {
  it('has a stable name', () => {
    expect(processor.getProcessorName()).toBe('RegisAliasRelationProcessor');
  });

  it('emits one aliasOf relation per alias-of entity ref', async () => {
    const emit = jest.fn();
    await processor.postProcessEntity(
      imageEntity({
        'regis.io/alias-of':
          'resource:default/lib-nginx-latest, resource:default/lib-nginx-stable',
      }),
      loc as any,
      emit,
    );
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith(
      processingResult.relation({
        source: { kind: 'Resource', namespace: 'default', name: 'lib-nginx-1-27' },
        type: 'aliasOf',
        target: { kind: 'resource', namespace: 'default', name: 'lib-nginx-latest' },
      }),
    );
  });

  it('emits nothing without the alias-of annotation', async () => {
    const emit = jest.fn();
    await processor.postProcessEntity(imageEntity({}), loc as any, emit);
    expect(emit).not.toHaveBeenCalled();
  });

  it('ignores non-image entities', async () => {
    const emit = jest.fn();
    const playbook: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'Resource',
      metadata: {
        name: 'pb',
        annotations: { 'regis.io/alias-of': 'resource:default/x' },
      },
      spec: { type: 'regis-playbook' },
    };
    await processor.postProcessEntity(playbook, loc as any, emit);
    expect(emit).not.toHaveBeenCalled();
  });

  it('skips malformed refs but keeps valid ones', async () => {
    const emit = jest.fn();
    await processor.postProcessEntity(
      imageEntity({ 'regis.io/alias-of': ', resource:default/ok' }),
      loc as any,
      emit,
    );
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
