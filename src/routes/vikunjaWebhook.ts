import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { parseQuickAddRu } from '../parsers/quickAddRu.js';
import { vikunjaClient } from '../services/vikunjaClient.js';
import type { TaskPatch } from '../types/vikunja.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Zod schema for incoming Vikunja webhook
// ---------------------------------------------------------------------------

const UserSchema = z.object({
  id: z.number(),
  username: z.string(),
  email: z.string().optional(),
  name: z.string().optional(),
});

const LabelSchema = z.object({
  id: z.number(),
  title: z.string(),
  hex_color: z.string().optional(),
  created_by: UserSchema.optional(),
});

const TaskSchema = z.object({
  id: z.number(),
  title: z.string(),
  description: z.string().optional(),
  done: z.boolean().optional(),
  due_date: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  priority: z.number().optional(),
  project_id: z.number().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  created_by: UserSchema.optional(),
  labels: z.array(LabelSchema).nullable().optional(),
  repeat_after: z.number().optional(),
  repeat_mode: z.union([z.literal(0), z.literal(1), z.literal(3)]).optional(),
});

const WebhookPayloadSchema = z.object({
  event_name: z.string(),
  time: z.string().optional(),
  data: z.object({
    task: TaskSchema,
  }),
});

type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function handleWebhook(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Respond immediately — Vikunja doesn't wait for enrichment
  void reply.code(200).send({ ok: true });

  let payload: WebhookPayload;
  try {
    payload = WebhookPayloadSchema.parse(request.body);
  } catch (err) {
    logger.warn({ err }, 'Invalid webhook payload, skipping');
    return;
  }

  const { event_name, data } = payload;
  const task = data.task;

  const taskLog = logger.child({ taskId: task.id, title: task.title, event: event_name });

  // Only process task.created events
  if (event_name !== 'task.created') {
    taskLog.debug('Ignoring event (not task.created)');
    return;
  }

  // Skip if due_date already set (idempotency guard)
  if (task.due_date && task.due_date !== '0001-01-01T00:00:00Z') {
    taskLog.info('Task already has due_date, skipping enrichment');
    return;
  }

  const parsed = parseQuickAddRu(task.title);
  if (!parsed) {
    taskLog.debug('No quick-add markers found');
    return;
  }

  taskLog.info({ parsed }, 'Enriching task');

  // Build the API patch
  const patch: TaskPatch = {};

  if (parsed.due_date !== undefined) patch.due_date = parsed.due_date;
  if (parsed.priority !== undefined) patch.priority = parsed.priority;
  if (parsed.repeat_after !== undefined) patch.repeat_after = parsed.repeat_after;
  if (parsed.repeat_mode !== undefined) patch.repeat_mode = parsed.repeat_mode;
  if (parsed.cleaned_title !== undefined) patch.title = parsed.cleaned_title;

  // Resolve project name → ID
  if (parsed.project_name !== undefined) {
    try {
      const projectId = await vikunjaClient.resolveProjectId(parsed.project_name);
      if (projectId !== undefined) {
        patch.project_id = projectId;
        taskLog.info({ projectId, projectName: parsed.project_name }, 'Resolved project');
      } else {
        taskLog.warn({ projectName: parsed.project_name }, 'Project not found, skipping project_id');
      }
    } catch (err) {
      taskLog.error({ err }, 'Failed to resolve project, continuing without it');
    }
  }

  // Update task fields
  try {
    await vikunjaClient.updateTask(task.id, patch);
    taskLog.info({ patch }, 'Task updated');
  } catch (err) {
    taskLog.error({ err }, 'Failed to update task');
    return;
  }

  // Attach labels
  if (parsed.labels && parsed.labels.length > 0) {
    try {
      const labelIds = await vikunjaClient.resolveLabels(parsed.labels);
      await vikunjaClient.setTaskLabels(task.id, labelIds);
      taskLog.info({ labels: parsed.labels, labelIds }, 'Labels attached');
    } catch (err) {
      taskLog.error({ err }, 'Failed to attach labels');
    }
  }
}

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

export async function vikunjaWebhookRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post('/webhooks/vikunja', handleWebhook);
}
