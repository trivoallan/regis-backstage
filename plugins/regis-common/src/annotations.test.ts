import { Entity } from '@backstage/catalog-model';
import {
  REGIS_ANNOTATION_REPORT_URL,
  getRegisReportUrl,
  isRegisAvailable,
} from './annotations';

const entityWith = (annotations?: Record<string, string>): Entity => ({
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'svc', annotations },
  spec: {},
});

describe('annotations', () => {
  it('reads the report url annotation', () => {
    const e = entityWith({
      [REGIS_ANNOTATION_REPORT_URL]: 'https://host/report.json',
    });
    expect(getRegisReportUrl(e)).toBe('https://host/report.json');
    expect(isRegisAvailable(e)).toBe(true);
  });

  it('returns undefined when the annotation is absent', () => {
    const e = entityWith({ other: 'v' });
    expect(getRegisReportUrl(e)).toBeUndefined();
    expect(isRegisAvailable(e)).toBe(false);
  });

  it('handles entities with no annotations block', () => {
    expect(isRegisAvailable(entityWith())).toBe(false);
  });
});
