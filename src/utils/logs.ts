export function extractLogSummary(log: Record<string, unknown>): {
  timestamp: string;
  level: string;
  message: string;
  source: string;
  key_metadata: Record<string, unknown>;
} {
  const timestamp =
    (log['@timestamp'] as string) || (log.timestamp as string) || 'N/A';
  const level = (log.level as string) || (log.severity as string) || 'INFO';
  const message = (log.message as string) || (log.msg as string) || '';

  // Smart source detection
  const source =
    (log.k8s_pod_name as string) ||
    (log.container_name as string) ||
    (log.host as string) ||
    (log.source as string) ||
    (log.service as string) ||
    '';

  // Extract key metadata (excluding noise)
  const excludeFields = [
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

  const key_metadata: Record<string, unknown> = {};
  const importantFields = [
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

  // Add important fields first
  importantFields.forEach((field) => {
    if (log[field] !== undefined && log[field] !== null && log[field] !== '') {
      key_metadata[field] = log[field];
    }
  });

  // Add other non-excluded fields (limit to prevent overwhelming output)
  let otherFieldCount = 0;
  Object.keys(log).forEach((key) => {
    if (
      !excludeFields.includes(key) &&
      !importantFields.includes(key) &&
      otherFieldCount < 5 &&
      log[key] !== undefined &&
      log[key] !== null &&
      log[key] !== ''
    ) {
      key_metadata[key] = log[key];
      otherFieldCount++;
    }
  });

  return { timestamp, level, message, source, key_metadata };
}

export function formatLogEntry(
  log: Record<string, unknown>,
  index: number
): string {
  const summary = extractLogSummary(log);

  // Format timestamp nicely
  const timeStr =
    summary.timestamp !== 'N/A'
      ? new Date(summary.timestamp)
          .toISOString()
          .replace('T', ' ')
          .replace('Z', ' UTC')
      : 'N/A';

  // Truncate very long messages (increased from 200 to 1000 for better log analysis)
  const message =
    summary.message.length > 1000
      ? summary.message.substring(0, 1000) + '...'
      : summary.message;

  let formatted = `${index + 1}. [${timeStr}] ${(summary.level || 'INFO').toString().toUpperCase()}`;

  if (summary.source) {
    formatted += ` (${summary.source})`;
  }

  formatted += `\n   📝 ${message || 'No message'}`;

  // Add key metadata if present
  if (Object.keys(summary.key_metadata).length > 0) {
    formatted += '\n   🏷️  Metadata:';
    Object.entries(summary.key_metadata).forEach(([key, value]) => {
      const displayValue =
        typeof value === 'string' && value.length > 50
          ? value.substring(0, 50) + '...'
          : value;
      formatted += `\n      • ${key}: ${displayValue}`;
    });
  }

  return formatted;
}
