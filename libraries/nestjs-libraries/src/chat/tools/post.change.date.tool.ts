// No Time German: moves a post that hasn't gone out yet to another time, e.g. to spread the posts found by a tag
// (postsListTool's "tag") over random times. See PostsService.movePost.
import { AgentToolInterface } from '@gitroom/nestjs-libraries/chat/agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { PostsService } from '@gitroom/nestjs-libraries/database/prisma/posts/posts.service';
import { checkAuth } from '@gitroom/nestjs-libraries/chat/auth.context';

@Injectable()
export class PostChangeDateTool implements AgentToolInterface {
  constructor(private _postsService: PostsService) {}
  name = 'postChangeDateTool';
  optionalOnSelfHosted = true;

  run() {
    return createTool({
      id: 'postChangeDateTool',
      mcp: {
        annotations: {
          title: 'Change Post Time',
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      description: `
Moves one post that has not been published yet to another time. Find posts first with postsListTool (its "tag" filter finds
every post with a given post tag, e.g. "a2_vocabulary_de_to_en_60_" for all posts of part 60) and pass each post's "id".
A queued or failed post is queued again at the new time, which must be in the future.
A draft keeps being a draft at the new time, unless "queue" is true: then it is put in the queue to be published at that time.
Published posts and comments cannot be moved. To spread several posts over random times, call this once per post.
If the post cannot be moved, the result contains output.errors explaining why.
`,
      inputSchema: z.object({
        id: z.string().describe('The "id" of the post to move'),
        date: z
          .string()
          .describe('The new time in UTC, for example 2026-11-20T18:30:00'),
        queue: z
          .boolean()
          .optional()
          .describe('For a draft: true puts it in the queue at the new time (default false: it stays a draft)'),
      }),
      outputSchema: z.object({
        output: z
          .object({
            id: z.string(),
            state: z.string().describe('QUEUE or DRAFT'),
            publishDate: z.string().describe('UTC time'),
          })
          .or(z.object({ errors: z.string() })),
      }),
      execute: async (inputData, context) => {
        checkAuth(inputData, context);
        const organizationId = JSON.parse(
          (context?.requestContext as any)?.get('organization') as string
        ).id;
        // the time is UTC, also when written without a zone
        const date = /([zZ]|[+-]\d\d:?\d\d)$/.test(inputData.date)
          ? inputData.date
          : `${inputData.date}Z`;
        try {
          return {
            output: await this._postsService.movePost(
              organizationId,
              inputData.id,
              date,
              !!inputData.queue
            ),
          };
        } catch (err: any) {
          return {
            output: {
              errors:
                err?.response?.message || err?.message || 'The post could not be moved',
            },
          };
        }
      },
    });
  }
}
