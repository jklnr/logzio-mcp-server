const EXCLUDE_FIELDS = [
  '@timestamp',
  'timestamp',
  'level',
  'severity',
  'message',
  'msg',
  'time',
  'log',
  'stream',
  '_id',
  '_index',
  '_type',
  '_score',
];

const IMPORTANT_FIELDS = [
  'k8s_namespace_name',
  'k8s_pod_name',
  'container_name',
  'env_id',
  'status_code',
  'method',
  'path',
  'duration',
  'error_type',
  'user_id',
];

function getTimestamp(log: Record<string, unknown>): string {
  return (log['@timestamp'] as string) || (log.timestamp as string) || 'N/A';
}

function getLevel(log: Record<string, unknown>): string {
  return (log.level as string) || (log.severity as string) || 'INFO';
}

function getMessage(log: Record<string, unknown>): string {
  return (log.message as string) || (log.msg as string) || '';
}

function getSource(log: Record<string, unknown>): string {
  return (
    (log.k8s_pod_name as string) ||
    (log.container_name as string) ||
    (log.host as string) ||
    (log.source as string) ||
    (log.service as string) ||
    ''
  );
}

function collectKeyMetadata(
  log: Record<string, unknown>
): Record<string, unknown> {
  const key_metadata: Record<string, unknown> = {};

  for (const field of IMPORTANT_FIELDS) {
    const val = log[field];
    if (val !== undefined && val !== null && val !== '') {
      key_metadata[field] = val;
    }
  }

  let otherCount = 0;
  for (const key of Object.keys(log)) {
    if (otherCount >= 5) break;
    if (EXCLUDE_FIELDS.includes(key) || IMPORTANT_FIELDS.includes(key))
      continue;
    const val = log[key];
    if (val === undefined || val === null || val === '') continue;
    key_metadata[key] = val;
    otherCount++;
  }

  return key_metadata;
}

export function extractLogSummary(log: Record<string, unknown>): {
  timestamp: string;
  level: string;
  message: string;
  source: string;
  key_metadata: Record<string, unknown>;
} {
  return {
    timestamp: getTimestamp(log),
    level: getLevel(log),
    message: getMessage(log),
    source: getSource(log),
    key_metadata: collectKeyMetadata(log),
  };
}

export function formatLogEntry(
  log: Record<string, unknown>,
  index: number
): string {
  const summary = extractLogSummary(log);

  const timeStr =
    summary.timestamp !== 'N/A'
      ? new Date(summary.timestamp)
          .toISOString()
          .replace('T', ' ')
          .replace('Z', ' UTC')
      : 'N/A';

  const message =
    summary.message.length > 1000
      ? summary.message.substring(0, 1000) + '...'
      : summary.message;

  let formatted = `${index + 1}. [${timeStr}] ${(summary.level || 'INFO').toString().toUpperCase()}`;

  if (summary.source) {
    formatted += ` (${summary.source})`;
  }

  formatted += `\n   📝 ${message || 'No message'}`;

  if (Object.keys(summary.key_metadata).length > 0) {
    formatted += '\n   🏷️  Metadata:';
    for (const [key, value] of Object.entries(summary.key_metadata)) {
      const displayValue =
        typeof value === 'string' && value.length > 50
          ? value.substring(0, 50) + '...'
          : value;
      formatted += `\n      • ${key}: ${displayValue}`;
    }
  }

  return formatted;
}
