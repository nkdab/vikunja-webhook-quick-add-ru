export interface Project {
  id: number;
  title: string;
  description: string;
  owner: User;
  is_archived: boolean;
}

export interface Label {
  id: number;
  title: string;
  hex_color: string;
  created_by: User;
}

export interface TaskLabel {
  id: number;
  task_id: number;
  label_id: number;
  label: Label;
}

export interface User {
  id: number;
  username: string;
  email: string;
  name: string;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  done: boolean;
  done_at: string | null;
  due_date: string | null;
  start_date: string | null;
  end_date: string | null;
  priority: number;
  project_id: number;
  created: string;
  updated: string;
  created_by: User;
  labels: Label[] | null;
  repeat_after: number;
  repeat_mode: 0 | 1 | 3;
}

export interface VikunjaWebhookPayload {
  event_name: string;
  time: string;
  data: {
    task: Task;
  };
}

export interface TaskPatch {
  title?: string;
  due_date?: string;
  priority?: number;
  project_id?: number;
  repeat_after?: number;
  repeat_mode?: 0 | 1 | 3;
}

export interface LabelTaskRequest {
  label_id: number;
}
