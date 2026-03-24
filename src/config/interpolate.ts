const ENV_VAR_PATTERN = /\$\{([^}]+)\}/g;

export function interpolateEnvVars<T>(value: T): T {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    const result = value.replace(ENV_VAR_PATTERN, (_, varName: string) => {
      const envVal = process.env[varName];
      if (envVal === undefined) {
        throw new Error(`Missing required environment variable: ${varName}`);
      }
      return envVal;
    });
    return result as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolateEnvVars(item)) as T;
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = interpolateEnvVars(val);
    }
    return result as T;
  }

  return value;
}
