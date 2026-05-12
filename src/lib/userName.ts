export function formatFullName(
  lastName?: string | null,
  firstName?: string | null,
) {
  return [lastName?.trim(), firstName?.trim()]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

export function buildLoginKey(lastName: string, firstName: string) {
  return formatFullName(lastName, firstName);
}
