import { resolveSafeChildPath } from '@backstage/backend-plugin-api';
import { createTemplateAction } from '@backstage/plugin-scaffolder-node';
import {
  slugForImageRef,
  validateIndexImageEntry,
  type IndexImageEntry,
} from '@regis/backstage-plugin-regis-common';
import fs from 'fs-extra';

/**
 * `regis:index:add-entry` — builds a single `IndexImageEntry`, validates it, and
 * writes it to `<indexDirPath>/images/<slug>.json` in the scaffolder workspace,
 * ready for `publish:github:pull-request` to open the intake PR.
 *
 * tier/score/digest/snapshotDate are intentionally omitted — the CI scan
 * (Slice C) fills them. The derived reportUrl keeps the entry schema-valid.
 */
export function createAddEntryAction() {
  return createTemplateAction({
    id: 'regis:index:add-entry',
    description:
      'Writes a single Regis index image-entry fragment into the workspace.',
    schema: {
      input: {
        imageRef: z =>
          z.string().describe('Full canonical image reference (identity).'),
        type: z =>
          z
            .enum(['first-party', 'third-party'])
            .describe('first-party (our output) or third-party (supply chain).'),
        owner: z =>
          z
            .string()
            .optional()
            .describe('Backstage owner entity ref. Required for third-party.'),
        system: z => z.string().optional().describe('Backstage system name.'),
        playbook: z =>
          z.string().optional().describe('Playbook id assessed against.'),
        reportBaseUrl: z =>
          z
            .string()
            .describe('Base URL the report.json will be published under.'),
        indexDirPath: z =>
          z
            .string()
            .describe('Path of the index directory within the target repo.'),
      },
      output: {
        fragmentPath: z =>
          z.string().describe('Workspace-relative path of the written fragment.'),
        slug: z =>
          z.string().describe('Branch-safe slug derived from the image ref.'),
      },
    },
    async handler(ctx) {
      const { imageRef, type, owner, system, playbook, reportBaseUrl, indexDirPath } =
        ctx.input;

      if (type === 'third-party' && !owner) {
        throw new Error(
          'third-party admission requires an owner/sponsor (the provider skips ownerless entities)',
        );
      }

      const slug = slugForImageRef(imageRef);
      const reportUrl = `${reportBaseUrl.replace(/\/$/, '')}/${slug}.json`;

      const entry: IndexImageEntry = {
        imageRef,
        reportUrl,
        ...(owner ? { owner } : {}),
        ...(system ? { system } : {}),
        ...(playbook ? { playbook } : {}),
      };
      validateIndexImageEntry(entry);

      const fragmentPath = `${indexDirPath}/images/${slug}.json`;
      const absPath = resolveSafeChildPath(ctx.workspacePath, fragmentPath);
      await fs.outputFile(absPath, `${JSON.stringify(entry, null, 2)}\n`);

      ctx.logger.info(`regis: wrote intake fragment ${fragmentPath}`);
      ctx.output('fragmentPath', fragmentPath);
      ctx.output('slug', slug);
    },
  });
}
