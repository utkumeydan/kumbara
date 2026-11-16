import type { IconName } from '@/components/ui';
import type { Debt } from './api';

export const DEBT_TYPES: { key: Debt['type']; label: string; icon: IconName }[] = [
  { key: 'card', label: 'Kredi kartı', icon: 'card-outline' },
  { key: 'loan', label: 'Kredi', icon: 'business-outline' },
  { key: 'person', label: 'Birine borç', icon: 'people-outline' },
  { key: 'other', label: 'Diğer', icon: 'document-text-outline' },
];
