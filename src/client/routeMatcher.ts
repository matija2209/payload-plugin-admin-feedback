const escapeRegex = (input: string): string => input.replace(/[.+^${}()|[\]\\]/g, '\\$&');

const toRegExp = (pattern: string): RegExp => {
  const escaped = pattern
    .split('*')
    .map((segment) => escapeRegex(segment))
    .join('.*');

  return new RegExp(`^${escaped}$`);
};

export const pathMatchesAllowlist = (pathname: string, patterns: string[]): boolean => {
  if (patterns.length === 0) {
    return false;
  }

  return patterns.some((pattern) => toRegExp(pattern).test(pathname));
};
