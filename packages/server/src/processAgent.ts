import { execa } from 'execa';
import type { AgentAdapter } from '@airbag/core';

/** Bring-your-own agent as a child process. The process must post its own report. */
export function processAgent(command: string): AgentAdapter {
  return {
    id: 'process',
    label: `Bring your own: ${command}`,
    kind: 'process',
    async run(ctx) {
      ctx.message(`Starting external agent: ${command}`);
      const result = await execa(command, {
        shell: true,
        timeout: 120_000,
        reject: false,
        env: {
          ...process.env,
          AIRBAG_BASE_URL: ctx.baseUrl,
          ONECLICK_BASE_URL: ctx.baseUrl,
          NEAR_SWAP_API_URL: ctx.baseUrl,
          AIRBAG_TASK: JSON.stringify(ctx.task),
          AIRBAG_POLICY: JSON.stringify(ctx.policy),
        },
      });
      if (result.exitCode !== 0) {
        ctx.message(
          `External agent exited ${result.exitCode}: ${result.stderr.slice(0, 400) || 'no stderr'}`,
        );
      }
    },
  };
}
