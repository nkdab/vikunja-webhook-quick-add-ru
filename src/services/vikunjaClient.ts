import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import type { Label, Project, Task, TaskPatch } from '../types/vikunja.js';

interface FetchOptions {
  method?: string;
  body?: unknown;
}

export class VikunjaClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly retries: number;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.timeoutMs = config.http.timeoutMs;
    this.retries = config.http.retries;
  }

  private async request<T>(path: string, options: FetchOptions = {}): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const { method = 'GET', body } = options;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(`Vikunja API error ${response.status}: ${text}`);
        }

        // Some endpoints return empty body on success
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          return (await response.json()) as T;
        }
        return {} as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        const isServerError =
          lastError.message.includes('5') ||
          lastError.message.includes('timeout') ||
          lastError.name === 'AbortError';

        if (attempt < this.retries && isServerError) {
          logger.warn({ attempt, url, err: lastError.message }, 'Retrying Vikunja request');
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    throw lastError ?? new Error('Unknown error in VikunjaClient.request');
  }

  async getProjects(): Promise<Project[]> {
    return this.request<Project[]>('/projects');
  }

  async getLabels(): Promise<Label[]> {
    return this.request<Label[]>('/labels');
  }

  async createLabel(title: string): Promise<Label> {
    return this.request<Label>('/labels', {
      method: 'PUT',
      body: { title },
    });
  }

  async setTaskLabels(taskId: number, labelIds: number[]): Promise<void> {
    await Promise.all(
      labelIds.map((labelId) =>
        this.request<unknown>(`/tasks/${taskId}/labels`, {
          method: 'POST',
          body: { label_id: labelId },
        })
      )
    );
  }

  async updateTask(taskId: number, patch: TaskPatch): Promise<void> {
    // We need to send the full task for PATCH to work in Vikunja.
    // First fetch the current task, then merge.
    const current = await this.request<Task>(`/tasks/${taskId}`);

    const merged: Task = {
      ...current,
      ...patch,
    };

    await this.request<Task>(`/tasks/${taskId}`, {
      method: 'PATCH',
      body: merged,
    });
  }

  /**
   * Resolve label names to IDs, creating labels that don't exist yet.
   */
  async resolveLabels(names: string[]): Promise<number[]> {
    const existing = await this.getLabels();
    const labelMap = new Map(existing.map((l) => [l.title.toLowerCase().trim(), l.id]));

    const ids: number[] = [];
    for (const name of names) {
      const key = name.toLowerCase().trim();
      const existingId = labelMap.get(key);
      if (existingId !== undefined) {
        ids.push(existingId);
      } else {
        const created = await this.createLabel(name);
        ids.push(created.id);
        labelMap.set(key, created.id);
      }
    }
    return ids;
  }

  /**
   * Resolve a project name to its ID (case-insensitive match).
   * Returns undefined if not found.
   */
  async resolveProjectId(name: string): Promise<number | undefined> {
    const projects = await this.getProjects();
    const needle = name.toLowerCase().trim();
    const found = projects.find((p) => p.title.toLowerCase().trim() === needle);
    return found?.id;
  }
}

export const vikunjaClient = new VikunjaClient(
  config.vikunja.baseUrl,
  config.vikunja.token
);
