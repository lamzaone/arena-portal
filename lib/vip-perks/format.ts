export function formatPerkDuration(minutes: number) {
  if (minutes % 525600 === 0) return `${minutes / 525600}y`;
  if (minutes % 43200 === 0) return `${minutes / 43200}mo`;
  if (minutes % 10080 === 0) return `${minutes / 10080}w`;
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}
