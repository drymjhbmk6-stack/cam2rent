/**
 * Admin-UI-Primitiven (Schritt 6 der Admin-Modernisierung). Token-basiert,
 * theme-aware (Light/Dark), barrierearm. Ab Schritt 7/8 nutzen die Admin-Seiten
 * diese statt hand-kopierter Markup-/className-Blöcke.
 *
 * Das Feedback-System (`useToast`/`useConfirm`/`FeedbackProvider`) bleibt bewusst
 * unter `@/components/admin/ui/FeedbackProvider` importierbar (eigener Pfad).
 */
export { Button, type ButtonProps } from './Button';
export { Card } from './Card';
export { PageHeader } from './PageHeader';
export { Modal } from './Modal';
export { EmptyState } from './EmptyState';
export { Badge, BookingStatusBadge } from './StatusBadge';
export { Field, Input, Select, Textarea } from './Field';
export { SearchInput } from './SearchInput';
export { Toolbar, Pill, SegmentedControl } from './Filters';
export { Skeleton, TableSkeleton } from './Skeleton';
export { DataTable, type DataTableColumn, type DataTableProps } from './DataTable';
