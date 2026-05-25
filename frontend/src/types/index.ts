export interface User {
  id: string;
  email: string;
  name: string;
  gender: 'm' | 'f';
  partnerId: string | null;
}

export interface Partner {
  id: string;
  name: string;
  gender: 'm' | 'f';
}

export interface Entry {
  mood_level: string | null;
  mood_text: string | null;
  noticed_1: string | null;
  noticed_2: string | null;
  noticed_3: string | null;
  gratitude_1: string | null;
  gratitude_2: string | null;
  gratitude_3: string | null;
  gratitude_said: boolean;
  closeness_text: string | null;
  note_to_partner: string | null;
  free_thought: string | null;
  saved_at: string | null;
}

export interface CalendarDay {
  date: string;
  hasMine: boolean;
  hasPartner: boolean;
}

export interface Quality {
  qualityId: string;
  text: string;
  created_at: string;
}

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}
